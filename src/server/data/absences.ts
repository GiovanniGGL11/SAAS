import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/db';
import {
  addDays,
  calendarDateToUtc,
  getTodayInTz,
  utcToCalendarDate,
  type CalendarDate,
} from '@/lib/time';
import { recordAuditLog } from '@/server/data/audit';
import { UserError } from '@/server/errors';

/*
  Escala: ausências de dias inteiros (férias, atestado, curso) e bloqueios que se repetem toda
  semana. Tudo vira ScheduleBlock: a agenda mostra cinza e o agendamento online não oferece.
*/

const ACTIVE = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as const;
const fmt = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(d);

async function requireProfessional(companyId: string, professionalId: string) {
  const professional = await prisma.professional.findFirst({
    where: { id: professionalId, companyId },
    select: { id: true },
  });
  if (!professional) throw new UserError('Profissional não encontrado.');
}

export async function createAbsence(params: {
  companyId: string;
  professionalId: string;
  from: CalendarDate;
  to: CalendarDate;
  reason?: string | null;
  timezone: string;
  userId: string;
}) {
  await requireProfessional(params.companyId, params.professionalId);
  const startAt = calendarDateToUtc(params.from, 0, params.timezone);
  const endAt = calendarDateToUtc(addDays(params.to, 1), 0, params.timezone);
  if (endAt <= startAt) throw new UserError('A data final precisa ser igual ou depois da inicial.');
  if (endAt.getTime() - startAt.getTime() > 120 * 86_400_000) {
    throw new UserError('Registre ausências de até 120 dias por vez.');
  }
  // Ausência em cima de cliente marcado esconderia o atendimento: lista para remarcar antes.
  const clash = await prisma.appointment.findMany({
    where: {
      companyId: params.companyId,
      professionalId: params.professionalId,
      status: { in: [...ACTIVE] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { startAt: true },
    orderBy: { startAt: 'asc' },
  });
  if (clash.length) {
    const days = [...new Set(clash.map((a) => fmt(a.startAt, params.timezone)))]
      .slice(0, 5)
      .join(', ');
    throw new UserError(
      `${clash.length === 1 ? 'Há 1 atendimento marcado' : `Há ${clash.length} atendimentos marcados`} nesse período (${days}). Remarque antes de registrar a ausência.`,
    );
  }
  const block = await prisma.scheduleBlock.create({
    data: {
      professionalId: params.professionalId,
      startAt,
      endAt,
      reason: params.reason?.trim() || 'Ausência',
    },
  });
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'ScheduleBlock',
    entityId: block.id,
    action: 'created',
    userId: params.userId,
  });
  return block;
}

const minutesOf = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Bloqueio toda semana no mesmo dia e horário, por N semanas. Semanas com cliente marcado são puladas. */
export async function createWeeklyBlock(params: {
  companyId: string;
  professionalId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  weeks: number;
  reason?: string | null;
  timezone: string;
  userId: string;
}) {
  await requireProfessional(params.companyId, params.professionalId);
  const startMinutes = minutesOf(params.startTime);
  const endMinutes = minutesOf(params.endTime);
  if (endMinutes <= startMinutes)
    throw new UserError('O horário final precisa ser depois do inicial.');

  let day = getTodayInTz(params.timezone);
  while (new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay() !== params.weekday)
    day = addDays(day, 1);

  const seriesId = randomUUID();
  const created: Date[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < params.weeks; i++) {
    const date = addDays(day, i * 7);
    const startAt = calendarDateToUtc(date, startMinutes, params.timezone);
    const endAt = calendarDateToUtc(date, endMinutes, params.timezone);
    if (endAt <= new Date()) continue;
    const clash = await prisma.appointment.findFirst({
      where: {
        companyId: params.companyId,
        professionalId: params.professionalId,
        status: { in: [...ACTIVE] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (clash) {
      skipped.push(fmt(startAt, params.timezone));
      continue;
    }
    await prisma.scheduleBlock.create({
      data: {
        professionalId: params.professionalId,
        startAt,
        endAt,
        reason: params.reason?.trim() || 'Bloqueio semanal',
        seriesId,
      },
    });
    created.push(startAt);
  }
  if (created.length) {
    await recordAuditLog({
      companyId: params.companyId,
      entityType: 'ScheduleBlock',
      entityId: seriesId,
      action: 'created',
      userId: params.userId,
      metadata: { weekly: true, count: created.length },
    });
  }
  return { created: created.length, skipped };
}

export type UpcomingBlock = {
  id: string;
  seriesId: string | null;
  reason: string | null;
  startAt: Date;
  endAt: Date;
  /** Série: quantas vezes ainda vai acontecer. */
  occurrences: number;
  allDay: boolean;
};

/** Ausências e bloqueios futuros do profissional; séries semanais aparecem uma vez só. */
export async function listUpcomingBlocks(
  companyId: string,
  professionalId: string,
  timezone: string,
) {
  const blocks = await prisma.scheduleBlock.findMany({
    where: { professionalId, professional: { companyId }, endAt: { gt: new Date() } },
    orderBy: { startAt: 'asc' },
    take: 200,
  });
  const result: UpcomingBlock[] = [];
  const seen = new Map<string, UpcomingBlock>();
  for (const b of blocks) {
    if (b.seriesId && seen.has(b.seriesId)) {
      seen.get(b.seriesId)!.occurrences += 1;
      continue;
    }
    const start = utcToCalendarDate(b.startAt, timezone);
    const allDay =
      calendarDateToUtc(start, 0, timezone).getTime() === b.startAt.getTime() &&
      (b.endAt.getTime() - b.startAt.getTime()) % 86_400_000 < 3_600_000 * 2 &&
      b.endAt.getTime() - b.startAt.getTime() >= 82_800_000;
    const row = {
      id: b.id,
      seriesId: b.seriesId,
      reason: b.reason,
      startAt: b.startAt,
      endAt: b.endAt,
      occurrences: 1,
      allDay,
    };
    if (b.seriesId) seen.set(b.seriesId, row);
    result.push(row);
  }
  return result;
}

export async function deleteBlockSeries(companyId: string, seriesId: string, userId: string) {
  const result = await prisma.scheduleBlock.deleteMany({
    where: { seriesId, professional: { companyId }, endAt: { gt: new Date() } },
  });
  if (result.count === 0) throw new UserError('Bloqueio não encontrado.');
  await recordAuditLog({
    companyId,
    entityType: 'ScheduleBlock',
    entityId: seriesId,
    action: 'deleted',
    userId,
    metadata: { weekly: true, count: result.count },
  });
}
