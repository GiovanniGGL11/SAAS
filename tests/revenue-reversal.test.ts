import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  cancelAppointment,
  createAppointment,
  updateAppointmentStatus,
} from '@/server/data/appointments';
import { adjustStock, sellProductToAppointment } from '@/server/data/stock';
import { createTestCompany, deleteTestCompany } from './helpers';

/**
 * O caixa acompanha o atendimento: concluir lança a receita uma vez só; desfazer o "concluído"
 * ou cancelar tira a receita e o crédito de fidelidade; concluir de novo reativa, sem duplicar.
 */
describe('receita e fidelidade acompanham o status do atendimento', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;

  beforeEach(async () => {
    fixture = await createTestCompany('reversal');
    await prisma.loyaltyProgram.create({
      data: { companyId: fixture.company.id, active: true, mode: 'STAMPS', stampsRequired: 10 },
    });
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  async function newAppointment(startAt: string) {
    return createAppointment({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: new Date(startAt),
      createdByUserId: 'user_test',
    });
  }

  const setStatus = (id: string, status: 'DONE' | 'CONFIRMED') =>
    updateAppointmentStatus({
      companyId: fixture.company.id,
      id,
      status,
      updatedByUserId: 'user_test',
    });

  const incomeOf = (appointmentId: string) =>
    prisma.transaction.findMany({ where: { appointmentId, category: 'Atendimento' } });
  const loyaltyOf = (appointmentId: string) =>
    prisma.loyaltyEntry.count({ where: { appointmentId, kind: 'EARN' } });

  it('desfazer o concluído estorna; concluir de novo reativa sem duplicar', async () => {
    const appointment = await newAppointment('2030-04-01T13:00:00Z');

    await setStatus(appointment.id, 'DONE');
    expect((await incomeOf(appointment.id)).map((t) => t.status)).toEqual(['PAID']);
    expect(await loyaltyOf(appointment.id)).toBe(1);

    await setStatus(appointment.id, 'CONFIRMED');
    expect((await incomeOf(appointment.id)).map((t) => t.status)).toEqual(['CANCELED']);
    expect(await loyaltyOf(appointment.id)).toBe(0);

    await setStatus(appointment.id, 'DONE');
    await setStatus(appointment.id, 'DONE');
    expect((await incomeOf(appointment.id)).map((t) => t.status)).toEqual(['PAID']);
    expect(await loyaltyOf(appointment.id)).toBe(1);
  });

  it('cancelar um atendimento concluído tira a receita e a fidelidade', async () => {
    const appointment = await newAppointment('2030-04-02T13:00:00Z');
    await setStatus(appointment.id, 'DONE');

    await cancelAppointment({
      companyId: fixture.company.id,
      id: appointment.id,
      canceledByUserId: 'user_test',
    });

    expect((await incomeOf(appointment.id)).map((t) => t.status)).toEqual(['CANCELED']);
    expect(await loyaltyOf(appointment.id)).toBe(0);
  });

  it('dois "concluir" ao mesmo tempo lançam a receita uma vez só', async () => {
    const appointment = await newAppointment('2030-04-03T13:00:00Z');
    await Promise.all([setStatus(appointment.id, 'DONE'), setStatus(appointment.id, 'DONE')]);
    expect(await incomeOf(appointment.id)).toHaveLength(1);
  });

  it('duas vendas simultâneas não passam do estoque', async () => {
    const appointment = await newAppointment('2030-04-04T13:00:00Z');
    const product = await prisma.product.create({
      data: {
        companyId: fixture.company.id,
        name: 'Pomada',
        costPrice: 12,
        salePrice: 30,
        quantity: 0,
      },
    });
    await adjustStock(
      fixture.company.id,
      { productId: product.id, type: 'IN', quantity: 1 },
      'user_test',
    );

    const sell = () =>
      sellProductToAppointment(
        fixture.company.id,
        { appointmentId: appointment.id, productId: product.id, quantity: 1 },
        'user_test',
      );
    const results = await Promise.allSettled([sell(), sell()]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.quantity).toBe(0);
  });
});
