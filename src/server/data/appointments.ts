import { prisma } from '@/lib/db';
import { recordAuditLog } from '@/server/data/audit';
import { createIncomeFromAppointment } from '@/server/data/finance';
import type { Appointment, AppointmentStatus } from '@/generated/prisma/client';

export class AppointmentConflictError extends Error {
  constructor(reason: 'overlap' | 'blocked') {
    super(
      reason === 'overlap'
        ? 'This professional already has an appointment in this time range.'
        : 'This time range is blocked for this professional.',
    );
    this.name = 'AppointmentConflictError';
  }
}

export class ForeignEntityMismatchError extends Error {
  constructor(entity: 'client' | 'professional' | 'service') {
    super(`The given ${entity} does not belong to this company.`);
    this.name = 'ForeignEntityMismatchError';
  }
}

export class AppointmentNotFoundError extends Error {
  constructor() {
    super('Appointment not found.');
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
  updatedByUserId: string;
}): Promise<Appointment> {
  const existing = await prisma.appointment.findFirst({
    where: { id: params.id, companyId: params.companyId },
  });
  if (!existing) throw new AppointmentNotFoundError();

  // Duration is preserved from the existing appointment — moving only
  // shifts the time range, it never resizes it (resize is out of scope
  // for this phase).
  const durationMs = existing.endAt.getTime() - existing.startAt.getTime();
  const endAt = new Date(params.startAt.getTime() + durationMs);

  await assertNoConflict({
    companyId: params.companyId,
    professionalId: existing.professionalId,
    startAt: params.startAt,
    endAt,
    excludeAppointmentId: existing.id,
  });

  const result = await prisma.appointment.updateMany({
    where: { id: params.id, companyId: params.companyId },
    data: { startAt: params.startAt, endAt, updatedByUserId: params.updatedByUserId },
  });
  if (result.count === 0) throw new AppointmentNotFoundError();

  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Appointment',
    entityId: params.id,
    action: 'moved',
    userId: params.updatedByUserId,
    metadata: { startAt: params.startAt.toISOString(), endAt: endAt.toISOString() },
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
