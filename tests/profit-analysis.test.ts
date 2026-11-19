import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { checkoutAppointment, createAppointment } from '@/server/data/appointments';
import { createProduct } from '@/server/data/stock';
import { setServiceSupplies } from '@/server/data/service-supplies';
import { savePackagePlan, sellPackage, sellProducts } from '@/server/data/sales';
import { createTransaction } from '@/server/data/finance';
import {
  applyPrice,
  deletePricingSimulation,
  getPricingContext,
  listPricingSimulations,
  savePricingProfile,
  savePricingSimulation,
} from '@/server/data/pricing';
import {
  getForecastVsActual,
  getManagerialStatement,
  getProfitRankings,
  getRankingDrill,
  getStatementDrill,
} from '@/server/data/profit-analysis';
import { hasFeature } from '@/server/billing/features';
import { calculatePricing } from '@/lib/pricing';
import { currentMonthKey } from '@/lib/month';
import { createTestCompany, deleteTestCompany } from './helpers';

/**
 * Precificação e DRE gerencial com dados fictícios: limpeza de pele de R$ 100 (1 h) que gasta um
 * kit de R$ 20; um atendimento com R$ 10 de desconto, outro pago com sessão de pacote; um
 * protetor solar vendido no balcão; aluguel de R$ 1.000. Impostos de 6% na calculadora.
 */
describe('precificação e DRE gerencial', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let month: string;
  let kitId: string;
  let protetorId: string;
  const value = (rows: { key: string; value: number }[], key: string) =>
    rows.find((r) => r.key === key)?.value;

  beforeAll(async () => {
    f = await createTestCompany('profit');
    month = currentMonthKey(f.company.timezone);
    await prisma.service.update({
      where: { id: f.service.id },
      data: { price: 100, durationMinutes: 60, name: 'Limpeza de pele' },
    });
    const kit = await createProduct(f.company.id, {
      name: 'Kit limpeza',
      unit: 'un',
      quantity: 10,
      minQuantity: 0,
      costPrice: 20,
      salePrice: 0,
    });
    kitId = kit.id;
    const protetor = await createProduct(f.company.id, {
      name: 'Protetor solar',
      quantity: 5,
      minQuantity: 0,
      costPrice: 33,
      salePrice: 50,
    });
    protetorId = protetor.id;
    await setServiceSupplies(f.company.id, f.service.id, [{ productId: kitId, quantity: 1 }]);
    await savePricingProfile(
      f.company.id,
      {
        useRecurringExpenses: true,
        extraFixedMonthly: 2400,
        ownerWithdrawal: 3600,
        availableHours: 160,
        occupancyPercent: 75,
        taxPercent: 6,
        targetMarginPercent: 20,
        defaultPaymentMethod: 'PIX',
      },
      'u',
    );

    // 1) Atendimento com R$ 10 de desconto, no PIX.
    const a = await createAppointment({
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId: f.professional.id,
      serviceId: f.service.id,
      startAt: new Date(Date.now() - 5 * 60_000),
      createdByUserId: 'u',
    });
    await checkoutAppointment({
      companyId: f.company.id,
      id: a.id,
      paymentMethod: 'PIX',
      discount: 10,
      updatedByUserId: 'u',
    });
    // O custo do kit sobe depois: o atendimento já feito mantém o custo do dia (R$ 20).
    await prisma.product.update({ where: { id: kitId }, data: { costPrice: 30 } });

    // 2) Pacote de 4 sessões por R$ 320 (R$ 80/sessão) e um atendimento pago com uma sessão.
    const plan = await savePackagePlan(f.company.id, null, {
      name: 'Pacote 4 limpezas',
      serviceId: f.service.id,
      sessions: 4,
      price: 320,
      recurring: false,
    } as never);
    const pkg = await sellPackage({
      companyId: f.company.id,
      clientId: f.client.id,
      planId: plan!.id,
      payment: { method: 'PIX' },
      userId: 'u',
    });
    // Outra profissional atende no mesmo horário (a agenda não deixa sobrepor a mesma pessoa).
    const second = await prisma.professional.create({
      data: { companyId: f.company.id, name: 'Segunda profissional', color: '#f97316' },
    });
    const b = await createAppointment({
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId: second.id,
      serviceId: f.service.id,
      startAt: new Date(Date.now() - 3 * 60_000),
      createdByUserId: 'u',
    });
    await checkoutAppointment({
      companyId: f.company.id,
      id: b.id,
      paymentMethod: 'PIX',
      packageId: pkg.id,
      updatedByUserId: 'u',
    });

    // 3) Protetor vendido no balcão e 4) aluguel pago.
    await sellProducts({
      companyId: f.company.id,
      items: [{ productId: protetorId, quantity: 1 }],
      payment: { method: 'PIX' },
      userId: 'u',
    });
    await createTransaction(
      f.company.id,
      {
        type: 'EXPENSE',
        status: 'PAID',
        description: 'Aluguel',
        category: 'Aluguel',
        amount: 1000,
        paymentMethod: 'PIX',
        paidAt: new Date(),
      } as never,
      'u',
    );
  }, 120_000);
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('grava o desconto da comanda e o custo do material no dia do consumo', async () => {
    const done = await prisma.appointment.findMany({
      where: { companyId: f.company.id, status: 'DONE' },
      orderBy: { startAt: 'asc' },
      select: { discountAmount: true },
    });
    expect(done.map((d) => Number(d.discountAmount))).toEqual([10, 0]);
    const consumption = await prisma.stockMovement.findMany({
      where: { companyId: f.company.id, productId: kitId, type: 'OUT' },
      orderBy: { createdAt: 'asc' },
      select: { unitCost: true },
    });
    expect(consumption.map((m) => Number(m.unitCost))).toEqual([20, 30]);
    const sale = await prisma.stockMovement.findFirstOrThrow({
      where: { companyId: f.company.id, productId: protetorId, type: 'SALE' },
    });
    expect(Number(sale.unitCost)).toBe(33);
    expect(Number(sale.unitPrice)).toBe(50);
  });

  it('DRE por competência: pacote não conta duas vezes; CMV e CSP pelo custo gravado', async () => {
    const s = await getManagerialStatement(f.company.id, f.company.timezone, month, 'accrual');
    expect(value(s.rows, 'rev:Atendimento')).toBe(90);
    expect(value(s.rows, 'rev:Pacotes')).toBe(320);
    expect(value(s.rows, 'rev:Produto')).toBe(50);
    expect(value(s.rows, 'gross')).toBe(470);
    expect(value(s.rows, 'discounts')).toBe(-10);
    expect(value(s.rows, 'taxes')).toBe(-27.6); // 6% de 460
    expect(value(s.rows, 'net')).toBe(432.4);
    expect(value(s.rows, 'cmv')).toBe(-33);
    expect(value(s.rows, 'csp')).toBe(-50); // 20 (antes do aumento) + 30
    expect(value(s.rows, 'grossProfit')).toBe(349.4);
    expect(value(s.rows, 'exp:Aluguel')).toBe(-1000);
    expect(value(s.rows, 'result')).toBe(-650.6);
    expect(s.info.packageSessions).toEqual({ count: 1, value: 80 });
    expect(s.rows.find((r) => r.key === 'taxes')?.estimated).toBe(true);
    // Ponto de equilíbrio: 1.000 ÷ ((432,40 − 83) ÷ 470).
    expect(s.breakEven.revenueNeeded).toBeCloseTo(1345.17, 1);
    expect(s.breakEven.reached).toBe(false);
  });

  it('DRE por caixa: só o pago no mês; sem CSP (a compra é que é o custo)', async () => {
    const s = await getManagerialStatement(f.company.id, f.company.timezone, month, 'cash');
    expect(value(s.rows, 'gross')).toBe(470);
    expect(value(s.rows, 'net')).toBe(432.4);
    expect(value(s.rows, 'csp')).toBeUndefined();
    expect(Math.abs(value(s.rows, 'cmv')!)).toBe(0);
    expect(value(s.rows, 'result')).toBe(-567.6);
  });

  it('drill-down abre os lançamentos de uma linha', async () => {
    const d = await getStatementDrill(f.company.id, f.company.timezone, month, 'accrual', 'csp');
    expect(d.items).toHaveLength(2);
    expect(d.total).toBe(50);
    const disc = await getStatementDrill(
      f.company.id,
      f.company.timezone,
      month,
      'accrual',
      'discounts',
    );
    expect(disc.total).toBe(10);
  });

  it('ranking por serviço, produto e profissional', async () => {
    const r = await getProfitRankings(f.company.id, f.company.timezone, month);
    const service = r.services[0];
    expect(service.count).toBe(2);
    expect(service.revenue).toBe(170); // 90 + sessão de pacote de 80
    expect(service.costs).toBe(60.2); // 6% de 170 + 50 de material
    expect(service.contribution).toBe(109.8);
    expect(service.perHour).toBe(54.9);
    expect(r.products[0]).toMatchObject({ name: 'Protetor solar', revenue: 50, contribution: 14 });
    expect(r.professionals).toHaveLength(2);
    expect(r.professionals.reduce((s, p) => s + p.count, 0)).toBe(2);
    expect(r.professionals.reduce((s, p) => s + p.revenue, 0)).toBe(170);
    const drill = await getRankingDrill(
      f.company.id,
      f.company.timezone,
      month,
      'service',
      f.service.id,
    );
    expect(drill).toHaveLength(2);
  });

  it('previsto × realizado conta os atendimentos concluídos', async () => {
    const p = await getForecastVsActual(f.company.id, f.company.timezone, month);
    expect(p.appointments.actual).toBe(2);
    expect(p.revenue.actual).toBe(170);
  });

  it('calculadora com dados reais: insumos da ficha, simulação salva e aplicar preço', async () => {
    const ctx = await getPricingContext(f.company.id);
    const svc = ctx.services.find((s) => s.id === f.service.id)!;
    expect(svc.suppliesCost).toBe(30); // custo atual do kit
    expect(svc.agendaMinutes).toBe(60);
    expect(ctx.profile.taxPercent).toBe(6);
    const r = calculatePricing({
      fixedMonthly: ctx.profile.extraFixedMonthly + ctx.recurringTotal,
      ownerWithdrawal: ctx.profile.ownerWithdrawal,
      availableHours: ctx.profile.availableHours,
      occupancyPercent: ctx.profile.occupancyPercent,
      durationMinutes: svc.agendaMinutes,
      supplies: svc.suppliesCost,
      otherDirectCosts: 0,
      fixedChargesPerService: 0,
      percentRates: 0.06,
      targetMargin: 0.2,
    });
    expect(r.base).toBe(80); // 30 + 1 h × (20 + 30)
    const sim = await savePricingSimulation({
      companyId: f.company.id,
      userId: 'u',
      name: 'Limpeza com kit novo',
      kind: 'service',
      serviceId: f.service.id,
      inputs: { durationMinutes: 60 },
      summary: { minPrice: r.minPrice, targetPrice: r.targetPrice },
    });
    expect((await listPricingSimulations(f.company.id)).map((s) => s.id)).toContain(sim.id);
    const applied = await applyPrice({
      companyId: f.company.id,
      userId: 'u',
      kind: 'service',
      id: f.service.id,
      price: r.targetPrice!,
    });
    expect(applied.before).toBe(100);
    const after = await prisma.service.findUniqueOrThrow({ where: { id: f.service.id } });
    expect(Number(after.price)).toBe(r.targetPrice);
    await deletePricingSimulation(f.company.id, sim.id);
    expect(await listPricingSimulations(f.company.id)).toHaveLength(0);
  });

  it('não aplica preço em serviço de outra empresa', async () => {
    const other = await createTestCompany('profit_other');
    try {
      await expect(
        applyPrice({
          companyId: other.company.id,
          userId: 'u',
          kind: 'service',
          id: f.service.id,
          price: 120,
        }),
      ).rejects.toThrow('Serviço não encontrado');
    } finally {
      await deleteTestCompany(other.company.id);
    }
  });
});

describe('precificação por plano', () => {
  const company = (plan: string) => ({
    plan,
    subscriptionStatus: 'ACTIVE',
    trialEndsAt: null,
    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
  });
  it('Básico só tem a demonstração; Profissional calcula; Pro tem o DRE gerencial', () => {
    expect(hasFeature(company('essencial') as never, 'pricingCalculator')).toBe(false);
    expect(hasFeature(company('essencial') as never, 'profitAnalysis')).toBe(false);
    expect(hasFeature(company('profissional') as never, 'pricingCalculator')).toBe(true);
    expect(hasFeature(company('profissional') as never, 'profitAnalysis')).toBe(false);
    expect(hasFeature(company('pro') as never, 'pricingCalculator')).toBe(true);
    expect(hasFeature(company('pro') as never, 'profitAnalysis')).toBe(true);
  });
});
