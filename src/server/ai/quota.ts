import { prisma } from '@/lib/db';
import { AiAccessError } from '@/server/ai/access';

/*
  Franquia mensal de IA com reserva. Antes de chamar o provedor, reserva o pior caso (o teto de
  chamadas do pedido); depois concilia com o consumo real. A conferência do saldo e a reserva
  acontecem sob uma trava por empresa e mês: pedidos simultâneos não passam do limite.
  Reserva esquecida (processo caiu) expira sozinha.
*/

const RESERVATION_TTL_MS = 5 * 60_000;

/** "AAAA-MM" no fuso da empresa. */
export function usagePeriod(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}`;
}

async function balance(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  companyId: string,
  period: string,
) {
  const [row, reserved] = await Promise.all([
    tx.aiUsagePeriod.findUnique({ where: { companyId_period: { companyId, period } } }),
    tx.aiUsageReservation.aggregate({
      where: { companyId, period, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      _sum: { units: true },
    }),
  ]);
  return { used: row?.usedUnits ?? 0, reserved: reserved._sum.units ?? 0 };
}

export async function reserveUnits(params: {
  companyId: string;
  timezone: string;
  units: number;
  limit: number;
  feature: string;
}) {
  const period = usagePeriod(params.timezone);
  if (params.limit <= 0) throw new AiAccessError('quota_not_configured');
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai-quota:${params.companyId}:${period}`}))`;
      const { used, reserved } = await balance(tx, params.companyId, period);
      const free = params.limit - used - reserved;
      if (free <= 0) throw new AiAccessError('quota_exhausted');
      // Pede o pior caso, mas aceita o que sobra (o pedido para quando a reserva acabar).
      const units = Math.min(params.units, free);
      return tx.aiUsageReservation.create({
        data: {
          companyId: params.companyId,
          period,
          units,
          feature: params.feature,
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
        },
      });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

/** Concilia: troca a reserva pelo consumo real (mesmo se a reserva já expirou, o gasto conta). */
export async function settleReservation(
  reservationId: string,
  actualUnits: number,
  audioSeconds = 0,
) {
  await prisma.$transaction(
    async (tx) => {
      const reservation = await tx.aiUsageReservation.findUnique({ where: { id: reservationId } });
      if (!reservation || reservation.status !== 'ACTIVE') return;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai-quota:${reservation.companyId}:${reservation.period}`}))`;
      const claimed = await tx.aiUsageReservation.updateMany({
        where: { id: reservationId, status: 'ACTIVE' },
        data: { status: actualUnits > 0 ? 'SETTLED' : 'RELEASED' },
      });
      if (claimed.count === 0) return;
      await tx.aiUsagePeriod.upsert({
        where: {
          companyId_period: { companyId: reservation.companyId, period: reservation.period },
        },
        create: {
          companyId: reservation.companyId,
          period: reservation.period,
          usedUnits: actualUnits,
          audioSeconds,
        },
        update: {
          usedUnits: { increment: actualUnits },
          audioSeconds: { increment: audioSeconds },
        },
      });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

export async function getUsageSummary(companyId: string, timezone: string, limit: number) {
  const period = usagePeriod(timezone);
  const { used, reserved } = await prisma.$transaction((tx) => balance(tx, companyId, period));
  return { period, used, reserved, limit, remaining: Math.max(limit - used - reserved, 0) };
}
