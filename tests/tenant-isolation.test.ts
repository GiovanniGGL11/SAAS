import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AppointmentNotFoundError,
  cancelAppointment,
  createAppointment,
  getAppointmentById,
  moveAppointment,
} from '@/server/data/appointments';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('tenant isolation', () => {
  let companyA: Awaited<ReturnType<typeof createTestCompany>>;
  let companyB: Awaited<ReturnType<typeof createTestCompany>>;

  beforeEach(async () => {
    companyA = await createTestCompany('tenant-a');
    companyB = await createTestCompany('tenant-b');
  });

  afterEach(async () => {
    await deleteTestCompany(companyA.company.id);
    await deleteTestCompany(companyB.company.id);
  });

  it('does not let company B read an appointment that belongs to company A, even with the correct id', async () => {
    const appointment = await createAppointment({
      companyId: companyA.company.id,
      clientId: companyA.client.id,
      professionalId: companyA.professional.id,
      serviceId: companyA.service.id,
      startAt: new Date('2030-02-01T13:00:00Z'),
      createdByUserId: 'tester',
    });

    const asOwner = await getAppointmentById(companyA.company.id, appointment.id);
    const asOtherTenant = await getAppointmentById(companyB.company.id, appointment.id);

    expect(asOwner).not.toBeNull();
    expect(asOtherTenant).toBeNull();
  });

  it('does not let company B move an appointment that belongs to company A', async () => {
    const appointment = await createAppointment({
      companyId: companyA.company.id,
      clientId: companyA.client.id,
      professionalId: companyA.professional.id,
      serviceId: companyA.service.id,
      startAt: new Date('2030-02-02T13:00:00Z'),
      createdByUserId: 'tester',
    });

    await expect(
      moveAppointment({
        companyId: companyB.company.id,
        id: appointment.id,
        startAt: new Date('2030-02-02T15:00:00Z'),
        updatedByUserId: 'attacker',
      }),
    ).rejects.toBeInstanceOf(AppointmentNotFoundError);
  });

  it('does not let company B cancel an appointment that belongs to company A', async () => {
    const appointment = await createAppointment({
      companyId: companyA.company.id,
      clientId: companyA.client.id,
      professionalId: companyA.professional.id,
      serviceId: companyA.service.id,
      startAt: new Date('2030-02-03T13:00:00Z'),
      createdByUserId: 'tester',
    });

    await expect(
      cancelAppointment({
        companyId: companyB.company.id,
        id: appointment.id,
        canceledByUserId: 'attacker',
      }),
    ).rejects.toBeInstanceOf(AppointmentNotFoundError);

    const stillActive = await getAppointmentById(companyA.company.id, appointment.id);
    expect(stillActive?.status).toBe('SCHEDULED');
  });

  it('rejects creating an appointment with a client/professional/service from another company', async () => {
    await expect(
      createAppointment({
        companyId: companyA.company.id,
        clientId: companyB.client.id,
        professionalId: companyA.professional.id,
        serviceId: companyA.service.id,
        startAt: new Date('2030-02-04T13:00:00Z'),
        createdByUserId: 'tester',
      }),
    ).rejects.toThrow();
  });
});
