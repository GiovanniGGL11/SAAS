import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  cancelAppointment,
  checkoutAppointment,
  createAppointment,
} from '@/server/data/appointments';
import { computeCommissions } from '@/server/data/commissions';
import {
  ensureMembershipRenewals,
  listOpenTab,
  receiveTab,
  savePackagePlan,
  sellGiftCard,
  sellPackage,
  sellProducts,
} from '@/server/data/sales';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('pacotes, vale-presente, balcão e fiado', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  let companyId: string;
  let slot = 0;

  beforeEach(async () => {
    fixture = await createTestCompany('sales');
    companyId = fixture.company.id;
    await prisma.professional.update({
      where: { id: fixture.professional.id },
      data: { commissionType: 'PERCENTAGE', commissionValue: 50 },
    });
  });

  afterEach(async () => {
    await deleteTestCompany(companyId);
  });

  const appointment = () =>
    createAppointment({
      companyId,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id, // R$ 50
      startAt: new Date(Date.UTC(2030, 8, 2, 12 + slot++)),
      createdByUserId: 'user_test',
    });

  it('pacote: vende, usa sessão na comanda (sem cobrar de novo), comissão sobre a sessão e devolve ao cancelar', async () => {
    const plan = await savePackagePlan(companyId, null, {
      name: '4 cortes',
      serviceId: fixture.service.id,
      sessions: 4,
      price: 160,
      recurring: false,
    });
    const pkg = await sellPackage({
      companyId,
      clientId: fixture.client.id,
      planId: plan!.id,
      payment: { method: 'PIX' },
      userId: 'user_test',
    });
    expect(Number(pkg.sessionValue)).toBe(40);

    const a = await appointment();
    const { total } = await checkoutAppointment({
      companyId,
      id: a.id,
      paymentMethod: 'PIX',
      packageId: pkg.id,
      updatedByUserId: 'user_test',
    });
    expect(total).toBe(0);
    expect(
      (await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsUsed,
    ).toBe(1);
    const [line] = await computeCommissions(
      companyId,
      { startAt: new Date(Date.UTC(2030, 8, 1)), endAt: new Date(Date.UTC(2030, 8, 3)) },
      [fixture.professional.id],
    );
    expect(line.commission).toBe(20); // 50% de R$ 40 (valor da sessão)

    await cancelAppointment({ companyId, id: a.id, canceledByUserId: 'user_test' });
    expect(
      (await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsUsed,
    ).toBe(0);
  });

  it('vale-presente paga parte, o resto vai no fiado e é recebido depois', async () => {
    const card = await sellGiftCard({
      companyId,
      amount: 30,
      recipientName: 'Ana',
      payment: { method: 'CASH' },
      userId: 'user_test',
    });
    const a = await appointment();
    const { total } = await checkoutAppointment({
      companyId,
      id: a.id,
      paymentMethod: 'PIX',
      giftCardCode: card.code.toLowerCase(),
      payOnTab: true,
      updatedByUserId: 'user_test',
    });
    expect(total).toBe(20);
    expect(
      Number((await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balance),
    ).toBe(0);

    const tab = await listOpenTab(companyId, fixture.client.id);
    expect(tab.map((t) => t.amount)).toEqual([20]);
    await receiveTab(companyId, tab[0].id, 'DEBIT_CARD');
    expect(await listOpenTab(companyId, fixture.client.id)).toEqual([]);
  });

  it('balcão: baixa o estoque e não vende mais do que tem', async () => {
    const product = await prisma.product.create({
      data: { companyId, name: 'Pomada', costPrice: 10, salePrice: 39.9, quantity: 3 },
    });
    const sale = await sellProducts({
      companyId,
      items: [{ productId: product.id, quantity: 2 }],
      payment: { method: 'CASH' },
      userId: 'user_test',
    });
    expect(sale.total).toBe(79.8);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).quantity).toBe(
      1,
    );
    await expect(
      sellProducts({
        companyId,
        items: [{ productId: product.id, quantity: 2 }],
        payment: { method: 'CASH' },
        userId: 'user_test',
      }),
    ).rejects.toThrow(/Estoque insuficiente/);
    await expect(
      sellProducts({
        companyId,
        items: [{ productId: product.id, quantity: 1 }],
        payment: { tab: true },
        userId: 'u',
      }),
    ).rejects.toThrow(/escolha o cliente/);
  });

  it('assinatura renova o ciclo, zera as sessões e lança a mensalidade a receber', async () => {
    const plan = await savePackagePlan(companyId, null, {
      name: 'Clube mensal',
      serviceId: fixture.service.id,
      sessions: 4,
      price: 150,
      recurring: true,
    });
    const pkg = await sellPackage({
      companyId,
      clientId: fixture.client.id,
      planId: plan!.id,
      payment: { method: 'PIX' },
      userId: 'user_test',
    });
    // Simula o ciclo vencido com 3 sessões usadas.
    await prisma.clientPackage.update({
      where: { id: pkg.id },
      data: { sessionsUsed: 3, periodEnd: new Date(Date.now() - 86_400_000) },
    });
    await ensureMembershipRenewals(companyId);
    await ensureMembershipRenewals(companyId);
    const renewed = await prisma.clientPackage.findUniqueOrThrow({ where: { id: pkg.id } });
    expect(renewed.sessionsUsed).toBe(0);
    expect(renewed.periodEnd!.getTime()).toBeGreaterThan(Date.now());
    const pending = await prisma.transaction.findMany({
      where: { companyId, category: 'Assinaturas', status: 'PENDING' },
    });
    expect(pending.map((t) => Number(t.amount))).toEqual([150]);
  });
});
