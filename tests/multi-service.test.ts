import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  checkoutAppointment,
  createAppointment,
  updateAppointmentDetails,
} from '@/server/data/appointments';
import { getRevenueByService } from '@/server/data/reports';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('vários serviços no mesmo atendimento', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  let beard: { id: string };

  beforeEach(async () => {
    fixture = await createTestCompany('multi');
    beard = await prisma.service.create({
      data: {
        companyId: fixture.company.id,
        name: 'Barba',
        durationMinutes: 20,
        price: 30,
        color: '#000',
      },
    });
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  it('soma duração e preço, guarda os itens, edita e cobra o total', async () => {
    const start = new Date('2030-07-01T13:00:00Z');
    const appointment = await createAppointment({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id, // 30 min, R$ 50
      extraServiceIds: [beard.id],
      startAt: start,
      createdByUserId: 'user_test',
    });
    expect(appointment.serviceNameSnapshot).toBe('Service multi + Barba');
    expect(appointment.durationMinutesSnapshot).toBe(50);
    expect(Number(appointment.priceSnapshot)).toBe(80);
    expect(appointment.endAt.getTime() - start.getTime()).toBe(50 * 60_000);
    expect(await prisma.appointmentItem.count({ where: { appointmentId: appointment.id } })).toBe(
      2,
    );

    // Um horário logo depois do fim (50 min) não conflita; dentro dele, sim.
    await expect(
      createAppointment({
        companyId: fixture.company.id,
        clientId: fixture.client.id,
        professionalId: fixture.professional.id,
        serviceId: beard.id,
        startAt: new Date(start.getTime() + 40 * 60_000),
        createdByUserId: 'user_test',
      }),
    ).rejects.toThrow();

    // Tirar a barba volta a ser um serviço só, sem itens.
    const edited = await updateAppointmentDetails({
      companyId: fixture.company.id,
      id: appointment.id,
      serviceIds: [fixture.service.id],
      updatedByUserId: 'user_test',
    });
    expect(Number(edited.priceSnapshot)).toBe(50);
    expect(await prisma.appointmentItem.count({ where: { appointmentId: appointment.id } })).toBe(
      0,
    );

    // E pôr de volta, cobrar e ver cada serviço no relatório.
    await updateAppointmentDetails({
      companyId: fixture.company.id,
      id: appointment.id,
      serviceIds: [fixture.service.id, beard.id],
      updatedByUserId: 'user_test',
    });
    const { total } = await checkoutAppointment({
      companyId: fixture.company.id,
      id: appointment.id,
      paymentMethod: 'PIX',
      updatedByUserId: 'user_test',
    });
    expect(total).toBe(80);
    const report = await getRevenueByService(fixture.company.id, {
      startAt: new Date('2030-06-30T00:00:00Z'),
      endAt: new Date('2030-07-02T00:00:00Z'),
    });
    expect(report.map((r) => [r.name, r.revenue, r.count])).toEqual([
      ['Service multi', 50, 1],
      ['Barba', 30, 1],
    ]);
  });
});
