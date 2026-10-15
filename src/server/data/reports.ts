import { prisma } from '@/lib/db';
import { utcToCalendarDate } from '@/lib/time';
import { computeCommissions } from '@/server/data/commissions';

export type DateRange = { startAt: Date; endAt: Date };

export type ProfessionalBreakdown = {
  professionalId: string;
  name: string;
  color: string;
  revenue: number;
  count: number;
  averageTicket: number;
  /** Comissão do período pela regra do profissional; null quando ele não tem regra cadastrada. */
  commission: number | null;
  commissionRule: string | null;
};

export async function getRevenueByProfessional(
  companyId: string,
  range: DateRange,
): Promise<ProfessionalBreakdown[]> {
  const grouped = await prisma.appointment.groupBy({
    by: ['professionalId'],
    where: { companyId, status: 'DONE', startAt: { gte: range.startAt, lte: range.endAt } },
    _sum: { priceSnapshot: true },
    _count: { _all: true },
    orderBy: { _sum: { priceSnapshot: 'desc' } },
  });
  if (grouped.length === 0) return [];

  const professionals = await prisma.professional.findMany({
    where: { companyId, id: { in: grouped.map((g) => g.professionalId) } },
    select: { id: true, name: true, color: true },
  });
  const byId = new Map(professionals.map((p) => [p.id, p]));

  // Mesmo cálculo do fechamento de comissão (Financeiro → Comissões), para os números baterem.
  const commissions = new Map(
    (
      await computeCommissions(
        companyId,
        { startAt: range.startAt, endAt: new Date(range.endAt.getTime() + 1) },
        grouped.map((g) => g.professionalId),
      )
    ).map((c) => [c.professionalId, c]),
  );

  return grouped
    .filter((g) => byId.has(g.professionalId))
    .map((g) => {
      const professional = byId.get(g.professionalId)!;
      const revenue = Number(g._sum.priceSnapshot ?? 0);
      const line = commissions.get(g.professionalId);
      return {
        professionalId: g.professionalId,
        name: professional.name,
        color: professional.color,
        revenue,
        count: g._count._all,
        averageTicket: g._count._all > 0 ? revenue / g._count._all : 0,
        commission: line?.commission ?? null,
        commissionRule: line?.rule ?? null,
      };
    });
}

export type ServiceBreakdown = {
  serviceId: string;
  name: string;
  color: string;
  revenue: number;
  count: number;
};

export async function getRevenueByService(
  companyId: string,
  range: DateRange,
): Promise<ServiceBreakdown[]> {
  // Atendimento com vários serviços conta cada um no seu serviço (corte + barba vira 1 corte e
  // 1 barba), com o preço de cada item.
  const appointments = await prisma.appointment.findMany({
    where: { companyId, status: 'DONE', startAt: { gte: range.startAt, lte: range.endAt } },
    select: {
      serviceId: true,
      priceSnapshot: true,
      items: { select: { serviceId: true, priceSnapshot: true } },
    },
  });
  if (appointments.length === 0) return [];

  const totals = new Map<string, { revenue: number; count: number }>();
  const add = (serviceId: string, price: number) => {
    const row = totals.get(serviceId) ?? { revenue: 0, count: 0 };
    row.revenue += price;
    row.count += 1;
    totals.set(serviceId, row);
  };
  for (const a of appointments) {
    if (a.items.length) for (const item of a.items) add(item.serviceId, Number(item.priceSnapshot));
    else add(a.serviceId, Number(a.priceSnapshot));
  }

  const services = await prisma.service.findMany({
    where: { companyId, id: { in: [...totals.keys()] } },
    select: { id: true, name: true, color: true },
  });
  return services
    .map((service) => ({
      serviceId: service.id,
      name: service.name,
      color: service.color,
      revenue: Math.round(totals.get(service.id)!.revenue * 100) / 100,
      count: totals.get(service.id)!.count,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export type WeekdayBreakdown = { weekday: number; label: string; revenue: number; count: number };

export async function getRevenueByWeekday(
  companyId: string,
  range: DateRange,
  timezone: string,
): Promise<WeekdayBreakdown[]> {
  const appointments = await prisma.appointment.findMany({
    where: { companyId, status: 'DONE', startAt: { gte: range.startAt, lte: range.endAt } },
    select: { priceSnapshot: true, startAt: true },
  });

  const revenue = new Array(7).fill(0) as number[];
  const count = new Array(7).fill(0) as number[];
  for (const appointment of appointments) {
    const date = utcToCalendarDate(appointment.startAt, timezone);
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    revenue[weekday] += Number(appointment.priceSnapshot);
    count[weekday] += 1;
  }

  return WEEKDAY_LABELS.map((label, weekday) => ({
    weekday,
    label,
    revenue: revenue[weekday],
    count: count[weekday],
  }));
}

export type CancellationStats = {
  total: number;
  completed: number;
  canceled: number;
  noShow: number;
  cancellationRate: number;
  noShowRate: number;
};

export async function getCancellationStats(
  companyId: string,
  range: DateRange,
): Promise<CancellationStats> {
  const grouped = await prisma.appointment.groupBy({
    by: ['status'],
    where: { companyId, startAt: { gte: range.startAt, lte: range.endAt } },
    _count: { _all: true },
  });

  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  const total = grouped.reduce((sum, g) => sum + g._count._all, 0);
  const completed = byStatus.get('DONE') ?? 0;
  const canceled = byStatus.get('CANCELED') ?? 0;
  const noShow = byStatus.get('NO_SHOW') ?? 0;

  return {
    total,
    completed,
    canceled,
    noShow,
    cancellationRate: total > 0 ? (canceled / total) * 100 : 0,
    noShowRate: total > 0 ? (noShow / total) * 100 : 0,
  };
}
