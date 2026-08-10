import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  cancelAppointment,
  createAppointment,
  moveAppointment,
  updateAppointmentStatus,
} from '@/server/data/appointments';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('appointment lifecycle', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;

  beforeEach(async () => {
    fixture = await createTestCompany('lifecycle');
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  it('creates with a snapshot, moves, changes status, and cancels — each step audited', async () => {
    const created = await createAppointment({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: new Date('2030-03-01T13:00:00Z'),
      createdByUserId: 'user_creator',
    });

    expect(created.serviceNameSnapshot).toBe(fixture.service.name);
    expect(created.durationMinutesSnapshot).toBe(fixture.service.durationMinutes);
    expect(Number(created.priceSnapshot)).toBe(Number(fixture.service.price));
    expect(created.status).toBe('SCHEDULED');

    // Changing the service afterwards must not rewrite the appointment's history.
    await prisma.service.update({
      where: { id: fixture.service.id },
      data: { price: 999, durationMinutes: 90, name: 'Renamed Service' },
    });

    const moved = await moveAppointment({
      companyId: fixture.company.id,
      id: created.id,
      startAt: new Date('2030-03-01T15:00:00Z'),
      updatedByUserId: 'user_mover',
    });
    expect(moved.startAt.toISOString()).toBe('2030-03-01T15:00:00.000Z');
    // Duration is preserved from the original appointment, not the (now-changed) service.
    expect(moved.endAt.getTime() - moved.startAt.getTime()).toBe(
      created.endAt.getTime() - created.startAt.getTime(),
    );
    expect(moved.serviceNameSnapshot).toBe(fixture.service.name);
    expect(Number(moved.priceSnapshot)).toBe(Number(fixture.service.price));

    const confirmed = await updateAppointmentStatus({
      companyId: fixture.company.id,
      id: created.id,
      status: 'CONFIRMED',
      updatedByUserId: 'user_status',
    });
    expect(confirmed.status).toBe('CONFIRMED');

    const canceled = await cancelAppointment({
      companyId: fixture.company.id,
      id: created.id,
      canceledByUserId: 'user_canceler',
      reason: 'Cliente remarcou',
    });
    expect(canceled.status).toBe('CANCELED');
    expect(canceled.canceledByUserId).toBe('user_canceler');
    expect(canceled.cancellationReason).toBe('Cliente remarcou');
    expect(canceled.canceledAt).not.toBeNull();

    const auditLogs = await prisma.auditLog.findMany({
      where: { companyId: fixture.company.id, entityId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditLogs.map((log) => log.action)).toEqual([
      'created',
      'moved',
      'status_changed',
      'canceled',
    ]);
    expect(auditLogs.map((log) => log.userId)).toEqual([
      'user_creator',
      'user_mover',
      'user_status',
      'user_canceler',
    ]);
  });

  it('allows a new appointment in the freed-up slot after cancellation', async () => {
    const first = await createAppointment({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: new Date('2030-03-02T13:00:00Z'),
      createdByUserId: 'tester',
    });

    await cancelAppointment({
      companyId: fixture.company.id,
      id: first.id,
      canceledByUserId: 'tester',
    });

    const second = await createAppointment({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: new Date('2030-03-02T13:00:00Z'),
      createdByUserId: 'tester',
    });

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('SCHEDULED');
  });
});
