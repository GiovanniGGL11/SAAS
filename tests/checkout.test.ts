import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  cancelAppointment,
  checkoutAppointment,
  createAppointment,
} from '@/server/data/appointments';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('comanda: concluir e cobrar', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;

  beforeEach(async () => {
    fixture = await createTestCompany('checkout');
    await prisma.coupon.create({
      data: {
        companyId: fixture.company.id,
        code: 'DEZ',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        maxUses: 1,
      },
    });
  });

  afterEach(async () => {
    await prisma.coupon.deleteMany({ where: { companyId: fixture.company.id } });
    await deleteTestCompany(fixture.company.id);
  });

  const newAppointment = (startAt: string) =>
    createAppointment({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: new Date(startAt),
      createdByUserId: 'user_test',
    });

  it('aplica cupom e desconto, registra a forma de pagamento e a gorjeta à parte', async () => {
    const appointment = await newAppointment('2030-05-01T13:00:00Z');
    const price = Number(appointment.priceSnapshot);

    const { total } = await checkoutAppointment({
      companyId: fixture.company.id,
      id: appointment.id,
      paymentMethod: 'PIX',
      discount: 5,
      couponCode: 'dez',
      tip: 7,
      updatedByUserId: 'user_test',
    });

    const expected = Math.round((price - 5 - price * 0.1) * 100) / 100;
    expect(total).toBeCloseTo(expected, 2);
    const transactions = await prisma.transaction.findMany({
      where: { appointmentId: appointment.id },
    });
    const service = transactions.find((t) => t.category === 'Atendimento')!;
    expect(service.paymentMethod).toBe('PIX');
    expect(Number(service.amount)).toBeCloseTo(expected, 2);
    expect(Number(transactions.find((t) => t.category === 'Gorjeta')!.amount)).toBe(7);
    expect(
      (await prisma.coupon.findFirstOrThrow({ where: { companyId: fixture.company.id } }))
        .usedCount,
    ).toBe(1);
  });

  it('cupom no limite é recusado; cancelar devolve o uso do cupom', async () => {
    const first = await newAppointment('2030-05-02T13:00:00Z');
    const second = await newAppointment('2030-05-02T15:00:00Z');
    const charge = (id: string) =>
      checkoutAppointment({
        companyId: fixture.company.id,
        id,
        paymentMethod: 'CASH',
        couponCode: 'DEZ',
        updatedByUserId: 'user_test',
      });

    await charge(first.id);
    await expect(charge(second.id)).rejects.toThrow('limite de usos');

    await cancelAppointment({
      companyId: fixture.company.id,
      id: first.id,
      canceledByUserId: 'user_test',
    });
    expect(
      (await prisma.coupon.findFirstOrThrow({ where: { companyId: fixture.company.id } }))
        .usedCount,
    ).toBe(0);
    await expect(charge(second.id)).resolves.toBeTruthy();
  });
});
