import { prisma } from '@/lib/db';
import { computeCommissions, type DateRange } from '@/server/data/commissions';

/*
  "Meus ganhos": o que o próprio profissional vê. Mesma conta da comissão do Financeiro (base = o
  que foi cobrado pelo serviço), mais os vales ainda não descontados e o fechamento do período,
  quando o dono já fez.
*/

const cents = (n: number) => Math.round(n * 100) / 100;

export type MyEarnings = {
  appointments: number;
  /** Total cobrado pelos serviços que ele fez no período. */
  production: number;
  /** null = sem regra de comissão cadastrada. */
  commission: number | null;
  rule: string | null;
  openAdvances: number;
  payout: { netAmount: number; createdAt: Date } | null;
  /** Previsto a receber: comissão − vales em aberto (sem fechamento ainda). */
  toReceive: number | null;
  upcoming: number;
  done: {
    id: string;
    startAt: Date;
    clientName: string;
    serviceName: string;
    price: number;
  }[];
};

export async function getMyEarnings(
  companyId: string,
  professionalId: string,
  range: DateRange,
  now = new Date(),
): Promise<MyEarnings> {
  const [lines, advances, payout, done, upcoming] = await Promise.all([
    computeCommissions(companyId, range, [professionalId]),
    prisma.professionalAdvance.findMany({
      where: { companyId, professionalId, payoutId: null },
      select: { amount: true },
    }),
    prisma.commissionPayout.findFirst({
      where: {
        companyId,
        professionalId,
        periodStart: { lt: range.endAt },
        periodEnd: { gt: range.startAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { netAmount: true, createdAt: true },
    }),
    prisma.appointment.findMany({
      where: {
        companyId,
        professionalId,
        status: 'DONE',
        startAt: { gte: range.startAt, lt: range.endAt },
      },
      orderBy: { startAt: 'desc' },
      take: 200,
      select: {
        id: true,
        startAt: true,
        serviceNameSnapshot: true,
        priceSnapshot: true,
        client: { select: { name: true } },
      },
    }),
    prisma.appointment.count({
      where: {
        companyId,
        professionalId,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        startAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) },
      },
    }),
  ]);
  const line = lines[0];
  const openAdvances = cents(advances.reduce((s, a) => s + Number(a.amount), 0));
  const commission = line?.commission ?? null;
  return {
    appointments: line?.appointments ?? 0,
    production: line?.base ?? 0,
    commission,
    rule: line?.rule ?? null,
    openAdvances,
    payout: payout ? { netAmount: Number(payout.netAmount), createdAt: payout.createdAt } : null,
    toReceive: commission === null || payout ? null : cents(commission - openAdvances),
    upcoming,
    done: done.map((a) => ({
      id: a.id,
      startAt: a.startAt,
      clientName: a.client.name,
      serviceName: a.serviceNameSnapshot,
      price: Number(a.priceSnapshot),
    })),
  };
}
