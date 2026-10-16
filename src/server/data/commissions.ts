import { prisma } from '@/lib/db';

import type { PaymentMethod } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

/*
  Comissão no padrão do mercado: base = o que foi cobrado pelo serviço (com desconto e cupom, sem
  gorjeta e produto). Cada serviço pode ter uma % própria; sem ela vale a regra do profissional
  (% do cobrado ou valor fixo por atendimento). Atendimento com vários serviços divide o cobrado
  entre eles na proporção do preço de cada um.
*/

export type DateRange = { startAt: Date; endAt: Date };

export type CommissionLine = {
  professionalId: string;
  name: string;
  color: string;
  appointments: number;
  /** Total cobrado pelos serviços no período. */
  base: number;
  commission: number | null;
  rule: string | null;
};

const cents = (n: number) => Math.round(n * 100) / 100;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function computeCommissions(
  companyId: string,
  range: DateRange,
  professionalIds?: string[],
): Promise<CommissionLine[]> {
  const appointments = await prisma.appointment.findMany({
    where: {
      companyId,
      status: 'DONE',
      startAt: { gte: range.startAt, lt: range.endAt },
      ...(professionalIds ? { professionalId: { in: professionalIds } } : {}),
    },
    select: {
      professionalId: true,
      serviceId: true,
      priceSnapshot: true,
      items: { select: { serviceId: true, priceSnapshot: true } },
      transactions: {
        // O sinal pago pelo link também é pagamento do serviço.
        where: { category: { in: ['Atendimento', 'Sinal'] }, status: 'PAID' },
        select: { amount: true },
      },
      // Sessão de pacote e vale-presente: o cliente já pagou antes, mas o serviço foi feito agora.
      credits: { select: { amount: true } },
    },
  });
  const proIds = professionalIds ?? [...new Set(appointments.map((a) => a.professionalId))];
  const serviceIds = new Set<string>();
  for (const a of appointments) {
    serviceIds.add(a.serviceId);
    for (const i of a.items) serviceIds.add(i.serviceId);
  }
  const [professionals, services] = await Promise.all([
    prisma.professional.findMany({
      where: { companyId, id: { in: proIds } },
      select: { id: true, name: true, color: true, commissionType: true, commissionValue: true },
      orderBy: { name: 'asc' },
    }),
    prisma.service.findMany({
      where: { companyId, id: { in: [...serviceIds] }, commissionPercent: { not: null } },
      select: { id: true, commissionPercent: true },
    }),
  ]);
  const servicePct = new Map(services.map((s) => [s.id, s.commissionPercent!]));

  const totals = new Map<
    string,
    { count: number; base: number; commission: number; hasRule: boolean }
  >();
  for (const p of professionals)
    totals.set(p.id, { count: 0, base: 0, commission: 0, hasRule: !!p.commissionType });
  const byId = new Map(professionals.map((p) => [p.id, p]));

  for (const a of appointments) {
    const pro = byId.get(a.professionalId);
    const row = totals.get(a.professionalId);
    if (!pro || !row) continue;
    const charged =
      a.transactions.reduce((s, t) => s + Number(t.amount), 0) +
      a.credits.reduce((s, c) => s + Number(c.amount), 0);
    const parts = a.items.length
      ? a.items.map((i) => ({ serviceId: i.serviceId, price: Number(i.priceSnapshot) }))
      : [{ serviceId: a.serviceId, price: Number(a.priceSnapshot) }];
    const listTotal = parts.reduce((s, p) => s + p.price, 0);
    row.count += 1;
    row.base += charged;
    for (const part of parts) {
      const share = listTotal > 0 ? (charged * part.price) / listTotal : charged / parts.length;
      const pct =
        servicePct.get(part.serviceId) ??
        (pro.commissionType === 'PERCENTAGE' ? Number(pro.commissionValue ?? 0) : null);
      if (pct !== null) {
        row.commission += (share * pct) / 100;
        row.hasRule = true;
      } else if (pro.commissionType === 'FIXED') {
        row.commission += Number(pro.commissionValue ?? 0) / parts.length;
      }
    }
  }

  return professionals.map((p) => {
    const t = totals.get(p.id)!;
    const value = p.commissionValue === null ? null : Number(p.commissionValue);
    const baseRule =
      p.commissionType === 'PERCENTAGE'
        ? `${value}% do cobrado`
        : p.commissionType === 'FIXED'
          ? `${brl(value ?? 0)} por atendimento`
          : null;
    return {
      professionalId: p.id,
      name: p.name,
      color: p.color,
      appointments: t.count,
      base: cents(t.base),
      commission: t.hasRule ? cents(t.commission) : null,
      rule: servicePct.size
        ? baseRule
          ? `${baseRule} · % própria em alguns serviços`
          : '% própria por serviço'
        : baseRule,
    };
  });
}

export type CommissionOverviewLine = CommissionLine & {
  /** Vales ainda não descontados. */
  openAdvances: number;
  advances: { id: string; amount: number; description: string | null; createdAt: Date }[];
  payout: { id: string; netAmount: number; createdAt: Date } | null;
};

/** Comissão de cada profissional ativo no período, com vales em aberto e o fechamento, se houver. */
export async function getCommissionOverview(
  companyId: string,
  range: DateRange,
): Promise<CommissionOverviewLine[]> {
  const active = await prisma.professional.findMany({
    where: { companyId, active: true },
    select: { id: true },
  });
  const ids = active.map((p) => p.id);
  const [lines, advances, payouts] = await Promise.all([
    computeCommissions(companyId, range, ids),
    prisma.professionalAdvance.findMany({
      where: { companyId, professionalId: { in: ids }, payoutId: null },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.commissionPayout.findMany({
      where: {
        companyId,
        professionalId: { in: ids },
        periodStart: { lt: range.endAt },
        periodEnd: { gt: range.startAt },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return lines.map((line) => {
    const mine = advances.filter((a) => a.professionalId === line.professionalId);
    const payout = payouts.find((p) => p.professionalId === line.professionalId);
    return {
      ...line,
      openAdvances: cents(mine.reduce((s, a) => s + Number(a.amount), 0)),
      advances: mine.map((a) => ({
        id: a.id,
        amount: Number(a.amount),
        description: a.description,
        createdAt: a.createdAt,
      })),
      payout: payout
        ? { id: payout.id, netAmount: Number(payout.netAmount), createdAt: payout.createdAt }
        : null,
    };
  });
}

/** Vale: sai do caixa agora (despesa "Comissões") e é descontado no próximo fechamento. */
export async function createAdvance(params: {
  companyId: string;
  professionalId: string;
  amount: number;
  description?: string | null;
  paymentMethod: PaymentMethod;
  userId: string;
}) {
  const professional = await prisma.professional.findFirst({
    where: { id: params.professionalId, companyId: params.companyId },
    select: { name: true },
  });
  if (!professional) throw new UserError('Profissional não encontrado.');
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        companyId: params.companyId,
        type: 'EXPENSE',
        status: 'PAID',
        category: 'Comissões',
        description: `Vale — ${professional.name}`,
        notes: params.description?.trim() || null,
        amount: params.amount,
        paymentMethod: params.paymentMethod,
        paidAt: new Date(),
        createdByUserId: params.userId,
      },
    });
    await tx.professionalAdvance.create({
      data: {
        companyId: params.companyId,
        professionalId: params.professionalId,
        amount: params.amount,
        description: params.description?.trim() || null,
        transactionId: transaction.id,
        createdByUserId: params.userId,
      },
    });
  });
}

/** Desfaz um vale ainda não descontado (lançado por engano): cancela a saída do caixa. */
export async function deleteAdvance(companyId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const advance = await tx.professionalAdvance.findFirst({ where: { id, companyId } });
    if (!advance) throw new UserError('Vale não encontrado.');
    if (advance.payoutId) throw new UserError('Este vale já foi descontado num fechamento.');
    if (advance.transactionId) {
      await tx.transaction.updateMany({
        where: { id: advance.transactionId, companyId },
        data: { status: 'CANCELED' },
      });
    }
    await tx.professionalAdvance.delete({ where: { id } });
  });
}

/**
 * Fecha a comissão do profissional no período: desconta os vales em aberto e lança o pagamento
 * do restante como despesa "Comissões". Um período só pode ser fechado uma vez.
 */
export async function closeCommission(params: {
  companyId: string;
  professionalId: string;
  range: DateRange;
  paymentMethod: PaymentMethod;
  userId: string;
  label: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'commission:' + params.professionalId}))`;
    const overlapping = await tx.commissionPayout.findFirst({
      where: {
        companyId: params.companyId,
        professionalId: params.professionalId,
        periodStart: { lt: params.range.endAt },
        periodEnd: { gt: params.range.startAt },
      },
    });
    if (overlapping) throw new UserError('A comissão deste período já foi fechada.');

    const [line] = await computeCommissions(params.companyId, params.range, [
      params.professionalId,
    ]);
    if (!line) throw new UserError('Profissional não encontrado.');
    if (line.commission === null) {
      throw new UserError('Defina a regra de comissão do profissional antes de fechar.');
    }
    const advances = await tx.professionalAdvance.findMany({
      where: { companyId: params.companyId, professionalId: params.professionalId, payoutId: null },
    });
    const advancesTotal = cents(advances.reduce((s, a) => s + Number(a.amount), 0));
    const net = cents(line.commission - advancesTotal);
    if (net < 0) {
      throw new UserError(
        `Os vales (${brl(advancesTotal)}) passam da comissão do período (${brl(line.commission)}). Feche um período maior ou remova um vale.`,
      );
    }

    const transaction =
      net > 0
        ? await tx.transaction.create({
            data: {
              companyId: params.companyId,
              type: 'EXPENSE',
              status: 'PAID',
              category: 'Comissões',
              description: `Comissão — ${line.name} (${params.label})`,
              notes: advancesTotal > 0 ? `Vales descontados: ${brl(advancesTotal)}` : null,
              amount: net,
              paymentMethod: params.paymentMethod,
              paidAt: new Date(),
              createdByUserId: params.userId,
            },
          })
        : null;
    const payout = await tx.commissionPayout.create({
      data: {
        companyId: params.companyId,
        professionalId: params.professionalId,
        periodStart: params.range.startAt,
        periodEnd: params.range.endAt,
        appointments: line.appointments,
        baseAmount: line.base,
        grossCommission: line.commission,
        advancesTotal,
        netAmount: net,
        transactionId: transaction?.id ?? null,
        createdByUserId: params.userId,
      },
    });
    if (advances.length) {
      await tx.professionalAdvance.updateMany({
        where: { id: { in: advances.map((a) => a.id) } },
        data: { payoutId: payout.id },
      });
    }
    return { gross: line.commission, advancesTotal, net };
  });
}

/** Desfaz um fechamento feito por engano: cancela o pagamento e devolve os vales para "em aberto". */
export async function reopenCommission(companyId: string, payoutId: string) {
  await prisma.$transaction(async (tx) => {
    const payout = await tx.commissionPayout.findFirst({ where: { id: payoutId, companyId } });
    if (!payout) throw new UserError('Fechamento não encontrado.');
    if (payout.transactionId) {
      await tx.transaction.updateMany({
        where: { id: payout.transactionId, companyId },
        data: { status: 'CANCELED' },
      });
    }
    await tx.professionalAdvance.updateMany({ where: { payoutId }, data: { payoutId: null } });
    await tx.commissionPayout.delete({ where: { id: payoutId } });
  });
}
