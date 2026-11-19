import { prisma } from '@/lib/db';
import type { PaymentMethod, Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';
import { getPaymentFees } from '@/server/data/finance-settings';

/*
  Dados reais para a calculadora de preço: parâmetros guardados da empresa, contas fixas,
  taxas da maquininha, serviços (duração + intervalo, materiais da ficha de consumo, comissão) e
  produtos de revenda. As contas em si ficam em src/lib/pricing.ts (as mesmas da demonstração).
*/

export type PricingProfileData = {
  useRecurringExpenses: boolean;
  extraFixedMonthly: number;
  ownerWithdrawal: number;
  availableHours: number;
  occupancyPercent: number;
  taxPercent: number;
  targetMarginPercent: number;
  defaultPaymentMethod: PaymentMethod | null;
  /** Ainda não salvo: valores de partida. */
  isDefault: boolean;
};

const DEFAULT_PROFILE: PricingProfileData = {
  useRecurringExpenses: true,
  extraFixedMonthly: 0,
  ownerWithdrawal: 0,
  availableHours: 160,
  occupancyPercent: 75,
  taxPercent: 0,
  targetMarginPercent: 20,
  defaultPaymentMethod: null,
  isDefault: true,
};

export async function getPricingProfile(companyId: string): Promise<PricingProfileData> {
  const row = await prisma.pricingProfile.findUnique({ where: { companyId } });
  if (!row) return DEFAULT_PROFILE;
  return {
    useRecurringExpenses: row.useRecurringExpenses,
    extraFixedMonthly: Number(row.extraFixedMonthly),
    ownerWithdrawal: Number(row.ownerWithdrawal),
    availableHours: Number(row.availableHours),
    occupancyPercent: Number(row.occupancyPercent),
    taxPercent: Number(row.taxPercent),
    targetMarginPercent: Number(row.targetMarginPercent),
    defaultPaymentMethod: row.defaultPaymentMethod,
    isDefault: false,
  };
}

export type PricingProfileInput = Omit<PricingProfileData, 'isDefault'>;

export async function savePricingProfile(
  companyId: string,
  data: PricingProfileInput,
  userId: string,
) {
  const values = {
    useRecurringExpenses: data.useRecurringExpenses,
    extraFixedMonthly: data.extraFixedMonthly,
    ownerWithdrawal: data.ownerWithdrawal,
    availableHours: data.availableHours,
    occupancyPercent: data.occupancyPercent,
    taxPercent: data.taxPercent,
    targetMarginPercent: data.targetMarginPercent,
    defaultPaymentMethod: data.defaultPaymentMethod,
    updatedByUserId: userId,
  };
  await prisma.pricingProfile.upsert({
    where: { companyId },
    create: { companyId, ...values },
    update: values,
  });
}

export type PricingCommission =
  | { kind: 'percent'; value: number; source: string }
  | { kind: 'fixed'; value: number; source: string }
  | { kind: 'none'; source: string };

/** Tudo o que a calculadora com dados reais precisa, numa ida ao servidor. */
export async function getPricingContext(companyId: string) {
  const [profile, recurring, fees, services, products, professionals] = await Promise.all([
    getPricingProfile(companyId),
    prisma.recurringExpense.findMany({
      where: { companyId, active: true },
      select: { id: true, description: true, amount: true },
      orderBy: { amount: 'desc' },
    }),
    getPaymentFees(companyId),
    prisma.service.findMany({
      where: { companyId, active: true },
      select: {
        id: true,
        name: true,
        price: true,
        durationMinutes: true,
        bufferMinutes: true,
        commissionPercent: true,
        supplies: {
          select: {
            quantity: true,
            product: { select: { name: true, unit: true, costPrice: true } },
          },
        },
        professionals: { select: { professionalId: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { companyId, active: true },
      select: {
        id: true,
        name: true,
        unit: true,
        costPrice: true,
        salePrice: true,
        quantity: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.professional.findMany({
      where: { companyId, active: true },
      select: { id: true, name: true, commissionType: true, commissionValue: true },
    }),
  ]);

  // Comissão do serviço: a % própria do serviço; sem ela, a regra de quem faz o serviço quando
  // todos têm a mesma; se variar, a calculadora pede o valor (não inventa).
  const commissionFor = (s: (typeof services)[number]): PricingCommission => {
    if (s.commissionPercent != null) {
      return { kind: 'percent', value: s.commissionPercent, source: '% própria do serviço' };
    }
    const doers = s.professionals.length
      ? professionals.filter((p) => s.professionals.some((sp) => sp.professionalId === p.id))
      : professionals;
    const rules = new Set(
      doers.map((p) => `${p.commissionType ?? 'NONE'}:${Number(p.commissionValue ?? 0)}`),
    );
    if (doers.length === 0 || rules.size !== 1) {
      return { kind: 'none', source: doers.length ? 'varia por profissional' : 'sem comissão' };
    }
    const p = doers[0];
    if (p.commissionType === 'PERCENTAGE')
      return { kind: 'percent', value: Number(p.commissionValue ?? 0), source: 'regra da equipe' };
    if (p.commissionType === 'FIXED')
      return { kind: 'fixed', value: Number(p.commissionValue ?? 0), source: 'regra da equipe' };
    return { kind: 'none', source: 'sem comissão' };
  };

  const recurringTotal =
    Math.round(recurring.reduce((sum, r) => sum + Number(r.amount), 0) * 100) / 100;

  return {
    profile,
    recurring: recurring.map((r) => ({
      id: r.id,
      description: r.description,
      amount: Number(r.amount),
    })),
    recurringTotal,
    fees: fees.map((f) => ({ paymentMethod: f.paymentMethod, feePercent: f.feePercent })),
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      price: Number(s.price),
      /** Tempo que ocupa a agenda: duração + intervalo de preparo/limpeza. */
      agendaMinutes: s.durationMinutes + s.bufferMinutes,
      durationMinutes: s.durationMinutes,
      bufferMinutes: s.bufferMinutes,
      supplies: s.supplies.map((sup) => ({
        name: sup.product.name,
        unit: sup.product.unit,
        quantity: sup.quantity,
        unitCost: Number(sup.product.costPrice),
      })),
      suppliesCost:
        Math.round(
          s.supplies.reduce((sum, sup) => sum + sup.quantity * Number(sup.product.costPrice), 0) *
            100,
        ) / 100,
      commission: commissionFor(s),
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      costPrice: Number(p.costPrice),
      salePrice: Number(p.salePrice),
      quantity: p.quantity,
    })),
  };
}

export type PricingContext = Awaited<ReturnType<typeof getPricingContext>>;

/** "Aplicar preço": muda o preço no catálogo (atendimentos já marcados mantêm o preço antigo). */
export async function applyPrice(params: {
  companyId: string;
  userId: string;
  kind: 'service' | 'product';
  id: string;
  price: number;
}) {
  if (!(params.price > 0) || params.price > 999_999) throw new UserError('Preço inválido.');
  const price = Math.round(params.price * 100) / 100;
  return prisma.$transaction(async (tx) => {
    let before: number;
    let name: string;
    if (params.kind === 'service') {
      const service = await tx.service.findFirst({
        where: { id: params.id, companyId: params.companyId },
        select: { price: true, name: true },
      });
      if (!service) throw new UserError('Serviço não encontrado.');
      before = Number(service.price);
      name = service.name;
      await tx.service.update({ where: { id: params.id }, data: { price } });
    } else {
      const product = await tx.product.findFirst({
        where: { id: params.id, companyId: params.companyId },
        select: { salePrice: true, name: true },
      });
      if (!product) throw new UserError('Produto não encontrado.');
      before = Number(product.salePrice);
      name = product.name;
      await tx.product.update({ where: { id: params.id }, data: { salePrice: price } });
    }
    await recordAuditLog(
      {
        companyId: params.companyId,
        entityType: params.kind === 'service' ? 'Service' : 'Product',
        entityId: params.id,
        action: 'updated',
        userId: params.userId,
        metadata: { field: 'price', from: before, to: price, via: 'calculadora de preço' },
      },
      tx,
    );
    return { name, before, price };
  });
}

export async function listPricingSimulations(companyId: string) {
  const rows = await prisma.pricingSimulation.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as 'service' | 'product',
    serviceId: r.serviceId,
    productId: r.productId,
    inputs: r.inputs as Record<string, unknown>,
    summary: r.summary as Record<string, number | null>,
    createdAt: r.createdAt,
  }));
}

export async function savePricingSimulation(params: {
  companyId: string;
  userId: string;
  name: string;
  kind: 'service' | 'product';
  serviceId?: string | null;
  productId?: string | null;
  inputs: Prisma.InputJsonValue;
  summary: Prisma.InputJsonValue;
}) {
  if (params.serviceId) {
    const ok = await prisma.service.count({
      where: { id: params.serviceId, companyId: params.companyId },
    });
    if (!ok) throw new UserError('Serviço não encontrado.');
  }
  if (params.productId) {
    const ok = await prisma.product.count({
      where: { id: params.productId, companyId: params.companyId },
    });
    if (!ok) throw new UserError('Produto não encontrado.');
  }
  const count = await prisma.pricingSimulation.count({ where: { companyId: params.companyId } });
  if (count >= 200) throw new UserError('Limite de 200 simulações. Apague as antigas.');
  return prisma.pricingSimulation.create({
    data: {
      companyId: params.companyId,
      createdByUserId: params.userId,
      name: params.name,
      kind: params.kind,
      serviceId: params.serviceId ?? null,
      productId: params.productId ?? null,
      inputs: params.inputs,
      summary: params.summary,
    },
    select: { id: true },
  });
}

export async function deletePricingSimulation(companyId: string, id: string) {
  const deleted = await prisma.pricingSimulation.deleteMany({ where: { id, companyId } });
  if (deleted.count === 0) throw new UserError('Simulação não encontrada.');
}
