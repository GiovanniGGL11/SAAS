import { clerkClient } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import { addDays, calendarDateToUtc, getTodayInTz, utcToCalendarDate } from '@/lib/time';
import { currentMonthKey, daysInMonth, monthRange } from '@/lib/month';
import { DEFAULT_DAY_WINDOW } from '@/server/data/appointments';
import { listLapsedClients } from '@/server/data/clients';
import { listLowStockProducts } from '@/server/data/stock';

/*
  Indicadores de gestão no padrão do mercado (Fresha, Vagaro, Zenoti): ocupação da equipe, retorno
  de clientes, faltas/cancelamentos, agendamento online, ticket médio — sempre comparados ao
  período anterior de mesmo tamanho.
*/

export type Range = { startAt: Date; endAt: Date };

/** O período imediatamente anterior, com a mesma duração. */
export function previousRange(range: Range): Range {
  const length = range.endAt.getTime() - range.startAt.getTime();
  return { startAt: new Date(range.startAt.getTime() - length), endAt: range.startAt };
}

const pct = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1000) / 10 : null;
const cents = (n: number) => Math.round(n * 100) / 100;
const minutesOf = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * Minutos disponíveis de cada profissional ativo no período: expediente de cada dia (ou a janela
 * padrão da agenda, para quem ainda não definiu) menos os bloqueios (folgas, almoço).
 */
async function availableMinutes(companyId: string, timezone: string, range: Range) {
  const professionals = await prisma.professional.findMany({
    where: { companyId, active: true },
    select: {
      id: true,
      availabilities: true,
      blocks: {
        where: { startAt: { lt: range.endAt }, endAt: { gt: range.startAt } },
        select: { startAt: true, endAt: true },
      },
    },
  });
  const days: { weekday: number; start: Date; end: Date }[] = [];
  let day = utcToCalendarDate(range.startAt, timezone);
  const lastDay = utcToCalendarDate(new Date(range.endAt.getTime() - 1), timezone);
  for (let guard = 0; guard < 400; guard++) {
    const start = calendarDateToUtc(day, 0, timezone);
    days.push({
      weekday: new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay(),
      start,
      end: calendarDateToUtc(addDays(day, 1), 0, timezone),
    });
    if (day.year === lastDay.year && day.month === lastDay.month && day.day === lastDay.day) break;
    day = addDays(day, 1);
  }

  const result = new Map<string, number>();
  for (const p of professionals) {
    let total = 0;
    for (const d of days) {
      const windows = p.availabilities.length
        ? p.availabilities
            .filter((a) => a.weekday === d.weekday)
            .map((a) => ({
              startMinutes: minutesOf(a.startTime),
              endMinutes: minutesOf(a.endTime),
            }))
        : [DEFAULT_DAY_WINDOW];
      for (const w of windows) {
        // Só a parte do expediente que cai dentro do período (o primeiro e o último dia podem ser
        // parciais, ex.: "próximos 7 dias" começa agora).
        const from = Math.max(d.start.getTime() + w.startMinutes * 60_000, range.startAt.getTime());
        const to = Math.min(d.start.getTime() + w.endMinutes * 60_000, range.endAt.getTime());
        if (to > from) total += (to - from) / 60_000;
      }
    }
    for (const b of p.blocks) {
      const from = Math.max(b.startAt.getTime(), range.startAt.getTime());
      const to = Math.min(b.endAt.getTime(), range.endAt.getTime());
      if (to > from) total -= (to - from) / 60_000;
    }
    result.set(p.id, Math.max(0, total));
  }
  return result;
}

async function bookedMinutes(
  companyId: string,
  range: Range,
  statuses: ('DONE' | 'IN_PROGRESS' | 'CONFIRMED' | 'SCHEDULED')[],
) {
  const rows = await prisma.appointment.findMany({
    where: {
      companyId,
      status: { in: statuses },
      startAt: { gte: range.startAt, lt: range.endAt },
    },
    select: { professionalId: true, startAt: true, endAt: true },
  });
  const result = new Map<string, number>();
  for (const r of rows) {
    result.set(
      r.professionalId,
      (result.get(r.professionalId) ?? 0) + (r.endAt.getTime() - r.startAt.getTime()) / 60_000,
    );
  }
  return result;
}

function sumMap(map: Map<string, number>) {
  let total = 0;
  for (const v of map.values()) total += v;
  return total;
}

/** Ocupação: tempo atendendo ÷ tempo disponível da equipe. */
async function occupancy(
  companyId: string,
  timezone: string,
  range: Range,
  statuses: Parameters<typeof bookedMinutes>[2],
) {
  const [available, booked] = await Promise.all([
    availableMinutes(companyId, timezone, range),
    bookedMinutes(companyId, range, statuses),
  ]);
  const byProfessional = new Map<string, number | null>();
  for (const [id, minutes] of available) {
    byProfessional.set(
      id,
      minutes > 0 ? Math.min(100, pct(booked.get(id) ?? 0, minutes) ?? 0) : null,
    );
  }
  const totalAvailable = sumMap(available);
  return {
    rate: totalAvailable > 0 ? Math.min(100, pct(sumMap(booked), totalAvailable) ?? 0) : null,
    byProfessional,
  };
}

async function periodNumbers(companyId: string, timezone: string, range: Range) {
  const [income, done, all, created, online, occ, served] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        companyId,
        type: 'INCOME',
        status: 'PAID',
        paidAt: { gte: range.startAt, lt: range.endAt },
      },
      _sum: { amount: true },
    }),
    prisma.appointment.count({
      where: { companyId, status: 'DONE', startAt: { gte: range.startAt, lt: range.endAt } },
    }),
    prisma.appointment.groupBy({
      by: ['status'],
      where: { companyId, startAt: { gte: range.startAt, lt: range.endAt } },
      _count: { _all: true },
    }),
    prisma.appointment.count({
      where: { companyId, createdAt: { gte: range.startAt, lt: range.endAt } },
    }),
    prisma.appointment.count({
      where: {
        companyId,
        createdByUserId: 'online-booking',
        createdAt: { gte: range.startAt, lt: range.endAt },
      },
    }),
    occupancy(companyId, timezone, range, ['DONE', 'IN_PROGRESS']),
    prisma.appointment.findMany({
      where: { companyId, status: 'DONE', startAt: { gte: range.startAt, lt: range.endAt } },
      select: { clientId: true },
      distinct: ['clientId'],
    }),
  ]);

  // Retorno: dos clientes atendidos no período, quantos já tinham vindo antes dele.
  const servedIds = served.map((s) => s.clientId);
  const returning = servedIds.length
    ? await prisma.appointment.findMany({
        where: {
          companyId,
          status: 'DONE',
          clientId: { in: servedIds },
          startAt: { lt: range.startAt },
        },
        select: { clientId: true },
        distinct: ['clientId'],
      })
    : [];

  const byStatus = Object.fromEntries(all.map((g) => [g.status, g._count._all])) as Record<
    string,
    number
  >;
  const total = all.reduce((s, g) => s + g._count._all, 0);
  const revenue = Number(income._sum.amount ?? 0);

  return {
    summary: {
      revenue: cents(revenue),
      completed: done,
      avgTicket: done > 0 ? cents(revenue / done) : 0,
      occupancy: occ.rate,
      clientsServed: servedIds.length,
      returningRate: pct(returning.length, servedIds.length),
      newClientsServed: servedIds.length - returning.length,
      lossRate: pct((byStatus.NO_SHOW ?? 0) + (byStatus.CANCELED ?? 0), total),
      noShows: byStatus.NO_SHOW ?? 0,
      cancellations: byStatus.CANCELED ?? 0,
      onlineRate: pct(online, created),
    },
    occupancyByProfessional: occ.byProfessional,
    servedIds,
  };
}

export type ProfessionalPerformance = {
  id: string;
  name: string;
  color: string;
  revenue: number;
  count: number;
  avgTicket: number;
  occupancy: number | null;
};

export type PeriodInsights = Awaited<ReturnType<typeof getPeriodInsights>>;

export async function getPeriodInsights(companyId: string, timezone: string, range: Range) {
  const [current, previous] = await Promise.all([
    periodNumbers(companyId, timezone, range),
    periodNumbers(companyId, timezone, previousRange(range)),
  ]);

  // Remarcação: dos atendidos no período, quantos já saíram com o próximo horário marcado.
  const rebooked = current.servedIds.length
    ? await prisma.appointment.findMany({
        where: {
          companyId,
          clientId: { in: current.servedIds },
          startAt: { gt: new Date() },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
        select: { clientId: true },
        distinct: ['clientId'],
      })
    : [];

  // Desempenho por profissional: o que foi cobrado pelos serviços (sem gorjeta e produto).
  const [professionals, charged, counts] = await Promise.all([
    prisma.professional.findMany({
      where: { companyId, active: true },
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' },
    }),
    prisma.transaction.findMany({
      where: {
        companyId,
        type: 'INCOME',
        status: 'PAID',
        category: 'Atendimento',
        paidAt: { gte: range.startAt, lt: range.endAt },
        appointmentId: { not: null },
      },
      select: { amount: true, appointment: { select: { professionalId: true } } },
    }),
    prisma.appointment.groupBy({
      by: ['professionalId'],
      where: { companyId, status: 'DONE', startAt: { gte: range.startAt, lt: range.endAt } },
      _count: { _all: true },
    }),
  ]);
  const revenueBy = new Map<string, number>();
  for (const t of charged) {
    const id = t.appointment!.professionalId;
    revenueBy.set(id, (revenueBy.get(id) ?? 0) + Number(t.amount));
  }
  const countBy = new Map(counts.map((c) => [c.professionalId, c._count._all]));
  const team: ProfessionalPerformance[] = professionals
    .map((p) => {
      const revenue = cents(revenueBy.get(p.id) ?? 0);
      const count = countBy.get(p.id) ?? 0;
      return {
        ...p,
        revenue,
        count,
        avgTicket: count > 0 ? cents(revenue / count) : 0,
        occupancy: current.occupancyByProfessional.get(p.id) ?? null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count);

  return {
    current: current.summary,
    previous: previous.summary,
    rebookingRate: pct(rebooked.length, current.servedIds.length),
    team,
  };
}

/** O dia de hoje e o que precisa de atenção — para o dono e para a recepção. */
export async function getTodayOverview(companyId: string, timezone: string) {
  const today = getTodayInTz(timezone);
  const start = calendarDateToUtc(today, 0, timezone);
  const end = calendarDateToUtc(addDays(today, 1), 0, timezone);
  const tomorrowEnd = calendarDateToUtc(addDays(today, 2), 0, timezone);
  const now = new Date();
  const weekAhead = { startAt: now, endAt: new Date(now.getTime() + 7 * 86_400_000) };

  const [
    todayRows,
    tomorrowUnconfirmed,
    nextWeek,
    cash,
    billsDue,
    lapsed,
    withHistory,
    lowStock,
    birthdays,
  ] = await Promise.all([
    prisma.appointment.groupBy({
      by: ['status'],
      where: { companyId, startAt: { gte: start, lt: end } },
      _count: { _all: true },
      _sum: { priceSnapshot: true },
    }),
    prisma.appointment.count({
      where: { companyId, status: 'SCHEDULED', startAt: { gte: end, lt: tomorrowEnd } },
    }),
    occupancy(companyId, timezone, weekAhead, ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'DONE']),
    prisma.cashSession.findFirst({
      where: { companyId, closedAt: null },
      select: { openedAt: true },
    }),
    prisma.transaction.aggregate({
      where: { companyId, type: 'EXPENSE', status: 'PENDING', dueDate: { lt: weekAhead.endAt } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    listLapsedClients(companyId, 60, 500),
    // Sem nenhum atendimento concluído não existe "sumido": a ausência é falta de base, não boa notícia.
    prisma.client.count({
      where: { companyId, active: true, appointments: { some: { status: 'DONE' } } },
    }),
    listLowStockProducts(companyId, 50),
    prisma.$queryRaw<{ id: string; name: string; phone: string | null }[]>`
        SELECT id, name, phone FROM "Client"
        WHERE "companyId" = ${companyId} AND active = true AND "birthDate" IS NOT NULL
          AND EXTRACT(MONTH FROM "birthDate") = ${today.month}
          AND EXTRACT(DAY FROM "birthDate") = ${today.day}
        ORDER BY name LIMIT 10`,
  ]);

  const byStatus = Object.fromEntries(todayRows.map((r) => [r.status, r])) as Record<
    string,
    (typeof todayRows)[number]
  >;
  const active = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'DONE'];
  const count = (s: string) => byStatus[s]?._count._all ?? 0;
  return {
    appointments: active.reduce((sum, s) => sum + count(s), 0),
    toConfirm: count('SCHEDULED'),
    confirmed: count('CONFIRMED'),
    inProgress: count('IN_PROGRESS'),
    done: count('DONE'),
    expectedRevenue: cents(
      active.reduce((sum, s) => sum + Number(byStatus[s]?._sum.priceSnapshot ?? 0), 0),
    ),
    tomorrowUnconfirmed,
    weekOccupancy: nextWeek.rate,
    cashOpen: cash !== null,
    billsDue: { count: billsDue._count._all, amount: cents(Number(billsDue._sum.amount ?? 0)) },
    lapsed: {
      count: lapsed.length,
      withHistory,
      top: lapsed.slice(0, 5).map((c) => ({
        ...c,
        daysAway: Math.floor((now.getTime() - c.lastVisitAt.getTime()) / 86_400_000),
      })),
    },
    lowStock: lowStock.length,
    birthdays,
    tomorrowDate: addDays(today, 1),
  };
}

// ---- Meta de faturamento do mês -----------------------------------------------------------------
// Guardada nos metadados da organização no Clerk (como o agendamento online): sem migration.

export async function getRevenueGoal(clerkOrgId: string): Promise<number | null> {
  try {
    const org = await (
      await clerkClient()
    ).organizations.getOrganization({ organizationId: clerkOrgId });
    const goal = Number(org.publicMetadata?.revenueGoal);
    return Number.isFinite(goal) && goal > 0 ? goal : null;
  } catch {
    return null;
  }
}

export async function setRevenueGoal(clerkOrgId: string, goal: number | null) {
  await (
    await clerkClient()
  ).organizations.updateOrganizationMetadata(clerkOrgId, {
    publicMetadata: { revenueGoal: goal },
  });
}

/** Andamento do mês: realizado até agora, ritmo e projeção para o fim do mês. */
export async function getMonthProgress(companyId: string, timezone: string) {
  const month = currentMonthKey(timezone);
  const range = monthRange(month, timezone);
  const income = await prisma.transaction.aggregate({
    where: {
      companyId,
      type: 'INCOME',
      status: 'PAID',
      paidAt: { gte: range.startAt, lt: range.endAt },
    },
    _sum: { amount: true },
  });
  const revenue = cents(Number(income._sum.amount ?? 0));
  const totalDays = daysInMonth(month);
  const dayOfMonth = getTodayInTz(timezone).day;
  return {
    revenue,
    dayOfMonth,
    totalDays,
    // Ritmo médio dos dias que já passaram (hoje conta pela metade, ainda está acontecendo).
    projection: cents((revenue / Math.max(0.5, dayOfMonth - 0.5)) * totalDays),
  };
}

/** Faturamento por dia dentro do período (entradas pagas, pela data do pagamento). */
export async function getRevenueByDayInRange(companyId: string, timezone: string, range: Range) {
  const transactions = await prisma.transaction.findMany({
    where: {
      companyId,
      type: 'INCOME',
      status: 'PAID',
      paidAt: { gte: range.startAt, lt: range.endAt },
    },
    select: { amount: true, paidAt: true },
  });
  const buckets = new Map<string, number>();
  const key = (d: { year: number; month: number; day: number }) => `${d.year}-${d.month}-${d.day}`;
  for (const t of transactions) {
    const k = key(utcToCalendarDate(t.paidAt!, timezone));
    buckets.set(k, (buckets.get(k) ?? 0) + Number(t.amount));
  }
  const result: { date: ReturnType<typeof utcToCalendarDate>; label: string; revenue: number }[] =
    [];
  let day = utcToCalendarDate(range.startAt, timezone);
  const last = utcToCalendarDate(new Date(range.endAt.getTime() - 1), timezone);
  for (let guard = 0; guard < 400; guard++) {
    result.push({
      date: day,
      label: `${String(day.day).padStart(2, '0')}/${String(day.month).padStart(2, '0')}`,
      revenue: cents(buckets.get(key(day)) ?? 0),
    });
    if (key(day) === key(last)) break;
    day = addDays(day, 1);
  }
  return result;
}
