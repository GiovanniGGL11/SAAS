import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { AppointmentConflictError, createAppointment } from '@/server/data/appointments';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('appointment conflict prevention', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;

  beforeEach(async () => {
    fixture = await createTestCompany('conflict');
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  it('rejects an overlapping appointment for the same professional', async () => {
    const start = new Date('2030-01-07T13:00:00Z');

    await createAppointment({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: start,
      createdByUserId: 'tester',
    });

    const overlappingStart = new Date('2030-01-07T13:15:00Z');

    await expect(
      createAppointment({
        companyId: fixture.company.id,
        clientId: fixture.client.id,
        professionalId: fixture.professional.id,
        serviceId: fixture.service.id,
        startAt: overlappingStart,
        createdByUserId: 'tester',
      }),
    ).rejects.toBeInstanceOf(AppointmentConflictError);
  });

  it('allows a back-to-back appointment right after the previous one ends', async () => {
    const start = new Date('2030-01-08T13:00:00Z');

    const first = await createAppointment({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: start,
      createdByUserId: 'tester',
    });

    const second = await createAppointment({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: first.endAt,
      createdByUserId: 'tester',
    });

    expect(second.startAt.getTime()).toBe(first.endAt.getTime());
  });

  it('rejects an appointment that falls inside a ScheduleBlock', async () => {
    await prisma.scheduleBlock.create({
      data: {
        professionalId: fixture.professional.id,
        startAt: new Date('2030-01-09T12:00:00Z'),
        endAt: new Date('2030-01-09T13:00:00Z'),
        reason: 'Almoço',
      },
    });

    await expect(
      createAppointment({
        companyId: fixture.company.id,
        clientId: fixture.client.id,
        professionalId: fixture.professional.id,
        serviceId: fixture.service.id,
        startAt: new Date('2030-01-09T12:15:00Z'),
        createdByUserId: 'tester',
      }),
    ).rejects.toBeInstanceOf(AppointmentConflictError);
  });
});
