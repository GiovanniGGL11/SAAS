import { prisma } from '@/lib/db';
import { recordAuditLog } from '@/server/data/audit';
import { createIncomeFromAppointment } from '@/server/data/finance';
import { earnLoyaltyFromAppointment } from '@/server/data/loyalty';
import type { Appointment, AppointmentStatus } from '@/generated/prisma/client';
import { addDays, calendarDateToUtc, utcToCalendarDate } from '@/lib/time';

export class AppointmentConflictError extends Error {
  constructor(reason: 'overlap' | 'blocked') {
    super(
      reason === 'overlap'
        ? 'Este profissional já tem um agendamento nesse horário.'
        : 'Esse horário está bloqueado na agenda deste profissional.',
    );
    this.name = 'AppointmentConflictError';
  }
}

export class ForeignEntityMismatchError extends Error {
  constructor(entity: 'client' | 'professional' | 'service') {
    const nome = { client: 'O cliente', professional: 'O profissional', service: 'O serviço' }[entity];
    super(`${nome} escolhido não pertence a esta empresa.`);
    this.name = 'ForeignEntityMismatchError';
  }
}

export class AppointmentNotFoundError extends Error {
  constructor() {
    super('Agendamento não encontrado.');
    this.name = 'AppointmentNotFoundError';
  }
}

const ACTIVE_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'DONE'];

export type AppointmentWithRelations = Appointment & {
  client: { id: string; name: string; phone: string | null };
  professional: { id: string; name: string; color: string };
  service: { id: string; name: string; color: string };
};

const relationsInclude = {
  client: { select: { id: true, name: true, phone: true } },
  professional: { select: { id: true, name: true, color: true } },
  service: { select: { id: true, name: true, color: true } },
} as const;

export async function listAppointmentsInRange(
  companyId: string,
  range: { startAt: Date; endAt: Date },
  filters?: { professionalId?: string; serviceId?: string; status?: AppointmentStatus },
): Promise<AppointmentWithRelations[]> {
  return prisma.appointment.findMany({
    where: {
      companyId,
      startAt: { lt: range.endAt },
      endAt: { gt: range.startAt },
      ...(filters?.professionalId ? { professionalId: filters.professionalId } : {}),
      ...(filters?.serviceId ? { serviceId: filters.serviceId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
    },
    include: relationsInclude,
    orderBy: { startAt: 'asc' },
  });
}

export async function getAppointmentById(
  companyId: string,
  id: string,
): Promise<AppointmentWithRelations | null> {
  return prisma.appointment.findFirst({
    where: { id, companyId },
    include: relationsInclude,
  });
}

/**
 * Throws AppointmentConflictError if the given professional already has an
 * overlapping active appointment, or the range falls inside a ScheduleBlock
 * (vacation/lunch/etc). Classic interval overlap: a.start < b.end AND a.end > b.start.
 *
 * Known limitation for this phase: this check-then-create is not race-proof
 * across concurrent requests (no DB-level exclusion constraint). Acceptable
 * for a single-instance MVP; a Postgres EXCLUDE constraint is the follow-up
 * if double-booking under concurrent load becomes an issue.
 */
async function assertNoConflict(params: {
  companyId: string;
  professionalId: string;
  startAt: Date;
  endAt: Date;
  excludeAppointmentId?: string;
}): Promise<void> {
  const overlappingAppointment = await prisma.appointment.findFirst({
    where: {
      companyId: params.companyId,
      professionalId: params.professionalId,
      status: { in: ACTIVE_STATUSES },
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
      ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
    },
    select: { id: true },
  });
  if (overlappingAppointment) {
    throw new AppointmentConflictError('overlap');
  }

  const overlappingBlock = await prisma.scheduleBlock.findFirst({
    where: {
      professionalId: params.professionalId,
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
    },
    select: { id: true },
  });
  if (overlappingBlock) {
    throw new AppointmentConflictError('blocked');
  }
}

export async function createAppointment(params: {
  companyId: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  startAt: Date;
  notes?: string;
  createdByUserId: string;
}): Promise<Appointment> {
  const [client, professional, service] = await Promise.all([
    prisma.client.findFirst({ where: { id: params.clientId, companyId: params.companyId } }),
    prisma.professional.findFirst({
      where: { id: params.professionalId, companyId: params.companyId },
    }),
    prisma.service.findFirst({ where: { id: params.serviceId, companyId: params.companyId } }),
  ]);
  if (!client) throw new ForeignEntityMismatchError('client');
  if (!professional) throw new ForeignEntityMismatchError('professional');
  if (!service) throw new ForeignEntityMismatchError('service');

  // endAt is always derived from the service's current duration — never
  // trusted from the caller — so it can never drift from the snapshot below.
  const endAt = new Date(params.startAt.getTime() + service.durationMinutes * 60_000);

  await assertNoConflict({
    companyId: params.companyId,
    professionalId: params.professionalId,
    startAt: params.startAt,
    endAt,
  });

  const appointment = await prisma.appointment.create({
    data: {
      companyId: params.companyId,
      clientId: params.clientId,
      professionalId: params.professionalId,
      serviceId: params.serviceId,
      startAt: params.startAt,
      endAt,
      notes: params.notes,
      serviceNameSnapshot: service.name,
      durationMinutesSnapshot: service.durationMinutes,
      priceSnapshot: service.price,
      createdByUserId: params.createdByUserId,
    },
  });

  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Appointment',
    entityId: appointment.id,
    action: 'created',
    userId: params.createdByUserId,
  });

  return appointment;
}

export async function moveAppointment(params: {
  companyId: string;
  id: string;
  startAt: Date;
  /** Quando informado, o atendimento passa para este profissional. */
  professionalId?: string;
  updatedByUserId: string;
}): Promise<Appointment> {
  const existing = await prisma.appointment.findFirst({
    where: { id: params.id, companyId: params.companyId },
  });
  if (!existing) throw new AppointmentNotFoundError();

  const professionalId = params.professionalId ?? existing.professionalId;
  if (professionalId !== existing.professionalId) {
    // Mesma regra da criação: o profissional de destino tem de ser desta empresa.
    const professional = await prisma.professional.findFirst({
      where: { id: professionalId, companyId: params.companyId },
      select: { id: true },
    });
    if (!professional) throw new ForeignEntityMismatchError('professional');
  }

  // Duration is preserved from the existing appointment — moving only
  // shifts the time range, it never resizes it (resize is out of scope
  // for this phase).
  const durationMs = existing.endAt.getTime() - existing.startAt.getTime();
  const endAt = new Date(params.startAt.getTime() + durationMs);

  await assertNoConflict({
    companyId: params.companyId,
    professionalId,
    startAt: params.startAt,
    endAt,
    excludeAppointmentId: existing.id,
  });

  const result = await prisma.appointment.updateMany({
    where: { id: params.id, companyId: params.companyId },
    data: { startAt: params.startAt, endAt, professionalId, updatedByUserId: params.updatedByUserId },
  });
  if (result.count === 0) throw new AppointmentNotFoundError();

  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Appointment',
    entityId: params.id,
    action: 'moved',
    userId: params.updatedByUserId,
    metadata: {
      startAt: params.startAt.toISOString(),
      endAt: endAt.toISOString(),
      ...(professionalId !== existing.professionalId
        ? { fromProfessionalId: existing.professionalId, toProfessionalId: professionalId }
        : {}),
    },
  });

  return (await prisma.appointment.findFirst({
    where: { id: params.id, companyId: params.companyId },
  }))!;
}

export async function updateAppointmentStatus(params: {
  companyId: string;
  id: string;
  status: Exclude<AppointmentStatus, 'CANCELED'>;
  updatedByUserId: string;
}): Promise<Appointment> {
  const result = await prisma.appointment.updateMany({
    where: { id: params.id, companyId: params.companyId },
    data: { status: params.status, updatedByUserId: params.updatedByUserId },
  });
  if (result.count === 0) throw new AppointmentNotFoundError();

  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Appointment',
    entityId: params.id,
    action: 'status_changed',
    userId: params.updatedByUserId,
    metadata: { status: params.status },
  });

  const updated = (await prisma.appointment.findFirst({
    where: { id: params.id, companyId: params.companyId },
  }))!;

  if (params.status === 'DONE') {
    await createIncomeFromAppointment(params.companyId, updated, params.updatedByUserId);
    await earnLoyaltyFromAppointment(params.companyId, updated, params.updatedByUserId);
  }

  return updated;
}

export async function cancelAppointment(params: {
  companyId: string;
  id: string;
  canceledByUserId: string;
  reason?: string;
}): Promise<Appointment> {
  const result = await prisma.appointment.updateMany({
    where: { id: params.id, companyId: params.companyId },
    data: {
      status: 'CANCELED',
      canceledAt: new Date(),
      canceledByUserId: params.canceledByUserId,
      cancellationReason: params.reason,
      updatedByUserId: params.canceledByUserId,
    },
  });
  if (result.count === 0) throw new AppointmentNotFoundError();

  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Appointment',
    entityId: params.id,
    action: 'canceled',
    userId: params.canceledByUserId,
    metadata: { reason: params.reason },
  });

  return (await prisma.appointment.findFirst({
    where: { id: params.id, companyId: params.companyId },
  }))!;
}

// ---------------------------------------------------------------------------
// Expediente e bloqueios: o que a grade mostra em cinza, e o "próximo horário livre".
// ---------------------------------------------------------------------------

export class InvalidBlockRangeError extends Error {
  constructor() {
    super('O fim do bloqueio precisa ser depois do início.');
    this.name = 'InvalidBlockRangeError';
  }
}

/** Expediente semanal dos profissionais ativos e os bloqueios que tocam o período. */
export async function getScheduleContext(companyId: string, range: { startAt: Date; endAt: Date }) {
  const [availabilities, blocks] = await Promise.all([
    prisma.professionalAvailability.findMany({
      where: { professional: { companyId, active: true } },
      select: { professionalId: true, weekday: true, startTime: true, endTime: true },
    }),
    prisma.scheduleBlock.findMany({
      where: {
        professional: { companyId },
        startAt: { lt: range.endAt },
        endAt: { gt: range.startAt },
      },
      select: { id: true, professionalId: true, startAt: true, endAt: true, reason: true },
      orderBy: { startAt: 'asc' },
    }),
  ]);
  return { availabilities, blocks };
}

export async function createScheduleBlock(params: {
  companyId: string;
  professionalId: string;
  startAt: Date;
  endAt: Date;
  reason?: string;
  createdByUserId: string;
}) {
  if (params.endAt.getTime() <= params.startAt.getTime()) throw new InvalidBlockRangeError();
  const professional = await prisma.professional.findFirst({
    where: { id: params.professionalId, companyId: params.companyId },
    select: { id: true },
  });
  if (!professional) throw new ForeignEntityMismatchError('professional');

  // Bloquear em cima de um agendamento esconderia um cliente marcado: quem bloqueia precisa
  // remarcar ou cancelar antes.
  const overlapping = await prisma.appointment.findFirst({
    where: {
      companyId: params.companyId,
      professionalId: params.professionalId,
      status: { in: ACTIVE_STATUSES },
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
    },
    select: { id: true },
  });
  if (overlapping) throw new AppointmentConflictError('overlap');

  const block = await prisma.scheduleBlock.create({
    data: {
      professionalId: params.professionalId,
      startAt: params.startAt,
      endAt: params.endAt,
      reason: params.reason,
    },
  });
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'ScheduleBlock',
    entityId: block.id,
    action: 'created',
    userId: params.createdByUserId,
  });
  return block;
}

export async function deleteScheduleBlock(params: { companyId: string; id: string; userId: string }) {
  // O bloqueio não tem companyId próprio: o escopo vem do profissional.
  const result = await prisma.scheduleBlock.deleteMany({
    where: { id: params.id, professional: { companyId: params.companyId } },
  });
  if (result.count === 0) throw new AppointmentNotFoundError();
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'ScheduleBlock',
    entityId: params.id,
    action: 'deleted',
    userId: params.userId,
  });
}

/** Janela usada para quem ainda não tem expediente cadastrado — a mesma da grade. */
export const DEFAULT_DAY_WINDOW = { startMinutes: 7 * 60, endMinutes: 21 * 60 };

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Primeiro horário a partir de `from` em que o serviço cabe inteiro: dentro do expediente do
 * profissional, sem agendamento ativo nem bloqueio. Sem profissional informado, procura em todos
 * e devolve quem fica livre primeiro. Procura até 14 dias à frente, em passos de 15 minutos.
 */
export async function findNextAvailableSlot(params: {
  companyId: string;
  serviceId: string;
  professionalId?: string;
  from: Date;
  timezone: string;
}): Promise<{ startAt: Date; professionalId: string } | null> {
  const service = await prisma.service.findFirst({
    where: { id: params.serviceId, companyId: params.companyId },
    select: { durationMinutes: true },
  });
  if (!service) throw new ForeignEntityMismatchError('service');

  const professionals = await prisma.professional.findMany({
    where: {
      companyId: params.companyId,
      active: true,
      ...(params.professionalId ? { id: params.professionalId } : {}),
    },
    select: { id: true, availabilities: { select: { weekday: true, startTime: true, endTime: true } } },
  });
  if (params.professionalId && professionals.length === 0) {
    throw new ForeignEntityMismatchError('professional');
  }

  const DAYS = 14;
  const STEP = 15;
  const horizonEnd = new Date(params.from.getTime() + (DAYS + 1) * 86_400_000);
  const ids = professionals.map((p) => p.id);
  const [busy, blocks] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        companyId: params.companyId,
        professionalId: { in: ids },
        status: { in: ACTIVE_STATUSES },
        startAt: { lt: horizonEnd },
        endAt: { gt: params.from },
      },
      select: { professionalId: true, startAt: true, endAt: true },
    }),
    prisma.scheduleBlock.findMany({
      where: { professionalId: { in: ids }, startAt: { lt: horizonEnd }, endAt: { gt: params.from } },
      select: { professionalId: true, startAt: true, endAt: true },
    }),
  ]);
  const occupied = [...busy, ...blocks];
  const durationMs = service.durationMinutes * 60_000;
  const firstDay = utcToCalendarDate(params.from, params.timezone);

  for (let offset = 0; offset < DAYS; offset++) {
    const day = addDays(firstDay, offset);
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    let best: { startAt: Date; professionalId: string } | null = null;

    for (const professional of professionals) {
      const windows = professional.availabilities.length
        ? professional.availabilities
            .filter((a) => a.weekday === weekday)
            .map((a) => ({ startMinutes: timeToMinutes(a.startTime), endMinutes: timeToMinutes(a.endTime) }))
        : [DEFAULT_DAY_WINDOW];

      for (const window of windows) {
        for (let m = window.startMinutes; m + service.durationMinutes <= window.endMinutes; m += STEP) {
          const startAt = calendarDateToUtc(day, m, params.timezone);
          if (startAt.getTime() < params.from.getTime()) continue;
          if (best && startAt.getTime() >= best.startAt.getTime()) break;
          const endAt = new Date(startAt.getTime() + durationMs);
          const clash = occupied.some(
            (o) =>
              o.professionalId === professional.id &&
              o.startAt.getTime() < endAt.getTime() &&
              o.endAt.getTime() > startAt.getTime(),
          );
          if (!clash) {
            best = { startAt, professionalId: professional.id };
            break;
          }
        }
      }
    }
    if (best) return best;
  }
  return null;
}

export class InvalidDurationError extends Error {
  constructor() {
    super('O atendimento precisa durar pelo menos 15 minutos.');
    this.name = 'InvalidDurationError';
  }
}

/** Puxar a borda do card: muda só o fim, conferindo conflito com o novo intervalo. */
export async function resizeAppointment(params: {
  companyId: string;
  id: string;
  endAt: Date;
  updatedByUserId: string;
}): Promise<Appointment> {
  const existing = await prisma.appointment.findFirst({
    where: { id: params.id, companyId: params.companyId },
  });
  if (!existing) throw new AppointmentNotFoundError();
  if (params.endAt.getTime() - existing.startAt.getTime() < 15 * 60_000) throw new InvalidDurationError();

  await assertNoConflict({
    companyId: params.companyId,
    professionalId: existing.professionalId,
    startAt: existing.startAt,
    endAt: params.endAt,
    excludeAppointmentId: existing.id,
  });

  await prisma.appointment.updateMany({
    where: { id: params.id, companyId: params.companyId },
    data: { endAt: params.endAt, updatedByUserId: params.updatedByUserId },
  });
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Appointment',
    entityId: params.id,
    action: 'moved',
    userId: params.updatedByUserId,
    metadata: { endAt: params.endAt.toISOString(), resized: true },
  });
  return (await prisma.appointment.findFirst({ where: { id: params.id, companyId: params.companyId } }))!;
}

export type AvailabilityInput = { weekday: number; startTime: string; endTime: string }[];

/** Expediente semanal do profissional: substitui tudo de uma vez, numa transação. */
export async function setProfessionalAvailability(params: {
  companyId: string;
  professionalId: string;
  availabilities: AvailabilityInput;
}) {
  const professional = await prisma.professional.findFirst({
    where: { id: params.professionalId, companyId: params.companyId },
    select: { id: true },
  });
  if (!professional) throw new ForeignEntityMismatchError('professional');

  await prisma.$transaction([
    prisma.professionalAvailability.deleteMany({ where: { professionalId: params.professionalId } }),
    prisma.professionalAvailability.createMany({
      data: params.availabilities.map((a) => ({ ...a, professionalId: params.professionalId })),
    }),
  ]);
}

export async function getProfessionalAvailability(companyId: string, professionalId: string) {
  return prisma.professionalAvailability.findMany({
    where: { professionalId, professional: { companyId } },
    select: { weekday: true, startTime: true, endTime: true },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  });
}
