import { prisma } from '@/lib/db';
import { addDays, calendarDateToUtc, formatTimeInTz, getTodayInTz } from '@/lib/time';
import { listLowStockProducts } from '@/server/data/stock';
import { listUpcomingSupplyShortages } from '@/server/data/service-supplies';

/*
  Avisos do sino, calculados na hora (sem tabela): o navegador pergunta a cada minuto. Cada
  consulta é pequena e tem limite. "Lido" e "dispensado" ficam no navegador de cada pessoa, pelo
  `id` — que muda quando o aviso muda de verdade (ex.: o estoque caiu de novo).
*/

export type NoticeKind =
  | 'client_booked'
  | 'client_canceled'
  | 'client_rescheduled'
  | 'client_confirmed'
  | 'upcoming'
  | 'unconfirmed'
  | 'low_stock'
  | 'supply_shortage'
  | 'birthday';

export type Notice = {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  href: string;
  /** Quando aconteceu (ISO), para "há 5 min"; ausente nos avisos de estado (estoque, aniversário). */
  at?: string;
};

/** Quem age pelo lado do cliente: reserva online, área do cliente e link de confirmação. */
const CLIENT_ACTORS = ['online-booking', 'client-portal', 'client-link'];
const CLIENT_ACTIVITY_HOURS = 48;
const UPCOMING_HOURS = 2;

const pad = (n: number) => String(n).padStart(2, '0');

function agendaHref(instant: Date, timezone: string, appointmentId?: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return `/agenda?data=${parts}${appointmentId ? `&agendamento=${appointmentId}` : ''}`;
}

function dayAndTime(instant: Date, timezone: string) {
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
  }).format(instant);
  return `${day} às ${formatTimeInTz(instant, timezone)}`;
}

async function clientActivity(companyId: string, timezone: string, now: Date): Promise<Notice[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      companyId,
      createdAt: { gte: new Date(now.getTime() - CLIENT_ACTIVITY_HOURS * 3_600_000) },
      entityType: 'Appointment',
      userId: { in: CLIENT_ACTORS },
      action: { in: ['created', 'moved', 'canceled', 'status_changed'] },
    },
    select: { id: true, entityId: true, action: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });
  if (logs.length === 0) return [];

  const appointments = await prisma.appointment.findMany({
    where: { companyId, id: { in: [...new Set(logs.map((l) => l.entityId))] } },
    select: {
      id: true,
      startAt: true,
      serviceNameSnapshot: true,
      client: { select: { name: true } },
    },
  });
  const byId = new Map(appointments.map((a) => [a.id, a]));

  const titles: Record<string, [NoticeKind, string]> = {
    created: ['client_booked', 'Agendamento online'],
    moved: ['client_rescheduled', 'Cliente remarcou'],
    canceled: ['client_canceled', 'Cliente cancelou'],
    status_changed: ['client_confirmed', 'Cliente confirmou'],
  };
  return logs.flatMap((log) => {
    const appointment = byId.get(log.entityId);
    if (!appointment) return [];
    const [kind, title] = titles[log.action];
    return [
      {
        id: `activity:${log.id}`,
        kind,
        title,
        body: `${appointment.client.name} · ${appointment.serviceNameSnapshot} · ${dayAndTime(appointment.startAt, timezone)}`,
        href: agendaHref(appointment.startAt, timezone, appointment.id),
        at: log.createdAt.toISOString(),
      },
    ];
  });
}

async function upcoming(companyId: string, timezone: string, now: Date): Promise<Notice[]> {
  const appointments = await prisma.appointment.findMany({
    where: {
      companyId,
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      startAt: { gte: now, lte: new Date(now.getTime() + UPCOMING_HOURS * 3_600_000) },
    },
    select: {
      id: true,
      startAt: true,
      serviceNameSnapshot: true,
      client: { select: { name: true } },
      professional: { select: { name: true } },
    },
    orderBy: { startAt: 'asc' },
    take: 8,
  });
  return appointments.map((a) => ({
    id: `upcoming:${a.id}:${a.startAt.getTime()}`,
    kind: 'upcoming',
    title: `Às ${formatTimeInTz(a.startAt, timezone)}`,
    body: `${a.client.name} · ${a.serviceNameSnapshot} com ${a.professional.name}`,
    href: agendaHref(a.startAt, timezone, a.id),
    at: a.startAt.toISOString(),
  }));
}

async function tomorrowUnconfirmed(companyId: string, timezone: string): Promise<Notice[]> {
  const tomorrow = addDays(getTodayInTz(timezone), 1);
  const startAt = calendarDateToUtc(tomorrow, 0, timezone);
  const count = await prisma.appointment.count({
    where: {
      companyId,
      status: 'SCHEDULED',
      startAt: { gte: startAt, lt: calendarDateToUtc(addDays(tomorrow, 1), 0, timezone) },
    },
  });
  if (count === 0) return [];
  const date = `${tomorrow.year}-${pad(tomorrow.month)}-${pad(tomorrow.day)}`;
  return [
    {
      id: `unconfirmed:${date}:${count}`,
      kind: 'unconfirmed',
      title: 'Amanhã sem confirmação',
      body:
        count === 1
          ? '1 agendamento de amanhã ainda não foi confirmado.'
          : `${count} agendamentos de amanhã ainda não foram confirmados.`,
      href: `/agenda?data=${date}`,
    },
  ];
}

async function lowStock(companyId: string): Promise<Notice[]> {
  const products = await listLowStockProducts(companyId, 8);
  return products.map((p) => ({
    id: `stock:${p.id}:${p.quantity}`,
    kind: 'low_stock',
    title: 'Estoque baixo',
    body: `${p.name}: ${p.quantity} ${p.quantity === 1 ? 'unidade' : 'unidades'} (mínimo ${p.minQuantity})`,
    href: '/estoque',
  }));
}

/** Material que os atendimentos marcados dos próximos 7 dias vão pedir e o estoque não cobre. */
async function supplyShortages(companyId: string, now: Date): Promise<Notice[]> {
  const shortages = await listUpcomingSupplyShortages(companyId, {
    from: now,
    to: new Date(now.getTime() + 7 * 86_400_000),
  });
  return shortages.map((s) => ({
    id: `supply:${s.productId}:${s.stock}:${s.needed}`,
    kind: 'supply_shortage' as const,
    title: 'Falta material para os próximos atendimentos',
    body: `${s.name}: precisa de ${s.needed}, tem ${s.stock} em estoque`,
    href: '/estoque',
  }));
}

async function birthdays(companyId: string, timezone: string): Promise<Notice[]> {
  const today = getTodayInTz(timezone);
  // Aniversário é guardado como data à meia-noite UTC; comparar mês e dia no próprio banco.
  const clients = await prisma.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, name FROM "Client"
    WHERE "companyId" = ${companyId} AND active = true AND "birthDate" IS NOT NULL
      AND EXTRACT(MONTH FROM "birthDate") = ${today.month}
      AND EXTRACT(DAY FROM "birthDate") = ${today.day}
    ORDER BY name
    LIMIT 8`;
  const date = `${today.year}-${pad(today.month)}-${pad(today.day)}`;
  return clients.map((c) => ({
    id: `birthday:${c.id}:${date}`,
    kind: 'birthday',
    title: 'Aniversário hoje',
    body: c.name,
    href: `/clientes/${c.id}`,
  }));
}

export async function listNotices(
  companyId: string,
  timezone: string,
  now = new Date(),
): Promise<Notice[]> {
  const [activity, soon, unconfirmed, stock, shortages, birthdayNotices] = await Promise.all([
    clientActivity(companyId, timezone, now),
    upcoming(companyId, timezone, now),
    tomorrowUnconfirmed(companyId, timezone),
    lowStock(companyId),
    supplyShortages(companyId, now),
    birthdays(companyId, timezone),
  ]);
  return [...activity, ...soon, ...unconfirmed, ...stock, ...shortages, ...birthdayNotices];
}
