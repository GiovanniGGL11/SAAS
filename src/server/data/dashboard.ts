import { prisma } from '@/lib/db';
import { utcToCalendarDate, utcToMinutesSinceMidnight, type CalendarDate } from '@/lib/time';

const ROLLING_WINDOW_DAYS = 30;

export type DashboardKpis = {
  revenue: number;
  revenuePrev: number;
  avgTicket: number;
  avgTicketPrev: number;
  completedCount: number;
  completedCountPrev: number;
  newClientsCount: number;
  newClientsCountPrev: number;
};

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export async function getDashboardKpis(companyId: string): Promise<DashboardKpis> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000);
  const prevPeriodStart = new Date(periodStart.getTime() - ROLLING_WINDOW_DAYS * 86_400_000);

  /*
    Faturamento = o que entrou no caixa (lançamentos de entrada pagos), o mesmo número do
    Financeiro. Antes o dashboard somava só o preço dos atendimentos concluídos e não via venda de
    produto nem entrada manual — os dois telas mostravam faturamentos diferentes.
  */
  const paidIncome = (gte: Date, lt: Date) =>
    prisma.transaction.aggregate({
      where: { companyId, type: 'INCOME', status: 'PAID', paidAt: { gte, lt } },
      _sum: { amount: true },
    });

  const [current, previous, income, incomePrev, newClientsCount, newClientsCountPrev] =
    await Promise.all([
      prisma.appointment.count({
        where: { companyId, status: 'DONE', startAt: { gte: periodStart, lte: now } },
      }),
      prisma.appointment.count({
        where: { companyId, status: 'DONE', startAt: { gte: prevPeriodStart, lt: periodStart } },
      }),
      paidIncome(periodStart, now),
      paidIncome(prevPeriodStart, periodStart),
      prisma.client.count({ where: { companyId, createdAt: { gte: periodStart, lte: now } } }),
      prisma.client.count({
        where: { companyId, createdAt: { gte: prevPeriodStart, lt: periodStart } },
      }),
    ]);

  const revenue = Number(income._sum.amount ?? 0);
  const revenuePrev = Number(incomePrev._sum.amount ?? 0);

  return {
    revenue,
    revenuePrev,
    avgTicket: current > 0 ? revenue / current : 0,
    avgTicketPrev: previous > 0 ? revenuePrev / previous : 0,
    completedCount: current,
    completedCountPrev: previous,
    newClientsCount,
    newClientsCountPrev,
  };
}

export { percentDelta };

export type DailyRevenue = { date: CalendarDate; label: string; revenue: number };

export async function getRevenueByDay(
  companyId: string,
  timezone: string,
  days = 14,
): Promise<DailyRevenue[]> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 86_400_000);

  // Mesma fonte do Financeiro: entradas pagas, no dia em que foram pagas.
  const transactions = await prisma.transaction.findMany({
    where: { companyId, type: 'INCOME', status: 'PAID', paidAt: { gte: periodStart, lte: now } },
    select: { amount: true, paidAt: true },
  });

  const buckets = new Map<string, number>();
  for (const transaction of transactions) {
    const date = utcToCalendarDate(transaction.paidAt!, timezone);
    const key = `${date.year}-${date.month}-${date.day}`;
    buckets.set(key, (buckets.get(key) ?? 0) + Number(transaction.amount));
  }

  const result: DailyRevenue[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const instant = new Date(now.getTime() - i * 86_400_000);
    const date = utcToCalendarDate(instant, timezone);
    const key = `${date.year}-${date.month}-${date.day}`;
    result.push({
      date,
      label: `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}`,
      revenue: buckets.get(key) ?? 0,
    });
  }
  return result;
}

export type TopPerformer = {
  id: string;
  name: string;
  color: string;
  revenue: number;
  count: number;
};

export async function getTopProfessional(companyId: string): Promise<TopPerformer | null> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000);

  const grouped = await prisma.appointment.groupBy({
    by: ['professionalId'],
    where: { companyId, status: 'DONE', startAt: { gte: periodStart, lte: now } },
    _sum: { priceSnapshot: true },
    _count: { _all: true },
    orderBy: { _sum: { priceSnapshot: 'desc' } },
    take: 1,
  });

  const top = grouped[0];
  if (!top) return null;

  const professional = await prisma.professional.findFirst({
    where: { id: top.professionalId, companyId },
    select: { id: true, name: true, color: true },
  });
  if (!professional) return null;

  return {
    id: professional.id,
    name: professional.name,
    color: professional.color,
    revenue: Number(top._sum.priceSnapshot ?? 0),
    count: top._count._all,
  };
}

export async function getTopService(companyId: string): Promise<TopPerformer | null> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000);

  const grouped = await prisma.appointment.groupBy({
    by: ['serviceId'],
    where: { companyId, status: 'DONE', startAt: { gte: periodStart, lte: now } },
    _sum: { priceSnapshot: true },
    _count: { _all: true },
    orderBy: { _count: { serviceId: 'desc' } },
    take: 1,
  });

  const top = grouped[0];
  if (!top) return null;

  const service = await prisma.service.findFirst({
    where: { id: top.serviceId, companyId },
    select: { id: true, name: true, color: true },
  });
  if (!service) return null;

  return {
    id: service.id,
    name: service.name,
    color: service.color,
    revenue: Number(top._sum.priceSnapshot ?? 0),
    count: top._count._all,
  };
}

export type HourBucket = { hour: number; count: number };

export async function getBusiestHours(companyId: string, timezone: string): Promise<HourBucket[]> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000);

  const appointments = await prisma.appointment.findMany({
    where: {
      companyId,
      status: { in: ['DONE', 'CONFIRMED', 'SCHEDULED', 'IN_PROGRESS'] },
      startAt: { gte: periodStart, lte: now },
    },
    select: { startAt: true },
  });

  const counts = new Array(24).fill(0) as number[];
  for (const appointment of appointments) {
    const minutes = utcToMinutesSinceMidnight(appointment.startAt, timezone);
    const hour = Math.floor(minutes / 60) % 24;
    counts[hour] += 1;
  }

  return counts.map((count, hour) => ({ hour, count }));
}
