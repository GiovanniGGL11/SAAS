import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAppointment, updateAppointmentStatus } from '@/server/data/appointments';
import {
  addLoyaltyManually,
  getClientLoyalty,
  listLoyaltyMembers,
  redeemLoyalty,
  saveLoyaltyProgram,
  type LoyaltyProgramInput,
} from '@/server/data/loyalty';
import { createTestCompany, deleteTestCompany } from './helpers';

type Fixture = Awaited<ReturnType<typeof createTestCompany>>;

const baseProgram: Omit<LoyaltyProgramInput, 'mode'> = {
  active: true,
  stampsRequired: 3,
  pointsPerReal: 2,
  pointsRequired: 100,
  cashbackPercent: 10,
  rewardType: 'FREE_SERVICE',
};

async function completeAppointment(fixture: Fixture, startAt: string) {
  const appointment = await createAppointment({
    companyId: fixture.company.id,
    clientId: fixture.client.id,
    professionalId: fixture.professional.id,
    serviceId: fixture.service.id,
    startAt: new Date(startAt),
    createdByUserId: 'user_test',
  });
  return updateAppointmentStatus({
    companyId: fixture.company.id,
    id: appointment.id,
    status: 'DONE',
    updatedByUserId: 'user_test',
  });
}

async function balanceOf(fixture: Fixture) {
  return (await getClientLoyalty(fixture.company.id, fixture.client.id))!.balance;
}

describe('loyalty program', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTestCompany('loyalty');
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  it('stamps: one per completed appointment, never twice, redeemable at the threshold', async () => {
    await saveLoyaltyProgram(fixture.company.id, {
      ...baseProgram,
      mode: 'STAMPS',
      rewardServiceId: fixture.service.id,
    });

    const done = await completeAppointment(fixture, '2030-04-01T13:00:00Z');
    // Marking the same appointment DONE again must not credit a second stamp.
    await updateAppointmentStatus({
      companyId: fixture.company.id,
      id: done.id,
      status: 'DONE',
      updatedByUserId: 'user_test',
    });
    expect(await balanceOf(fixture)).toBe(1);

    await expect(
      redeemLoyalty({
        companyId: fixture.company.id,
        clientId: fixture.client.id,
        createdByUserId: 'user_test',
      }),
    ).rejects.toThrow('Saldo insuficiente');

    await completeAppointment(fixture, '2030-04-02T13:00:00Z');
    await completeAppointment(fixture, '2030-04-03T13:00:00Z');
    expect(await balanceOf(fixture)).toBe(3);

    const members = await listLoyaltyMembers(fixture.company.id);
    expect(members).toEqual([expect.objectContaining({ id: fixture.client.id, balance: 3 })]);

    const redemption = await redeemLoyalty({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      createdByUserId: 'user_test',
    });
    expect(redemption.description).toBe(`${fixture.service.name} grátis`);
    expect(await balanceOf(fixture)).toBe(0);
  });

  it('points and cashback scale with price; switching modes starts balances fresh', async () => {
    // Fixture service costs R$ 50.
    await saveLoyaltyProgram(fixture.company.id, {
      ...baseProgram,
      mode: 'POINTS',
      rewardType: 'CUSTOM',
      rewardDescription: 'Brinde',
    });
    await completeAppointment(fixture, '2030-05-01T13:00:00Z');
    expect(await balanceOf(fixture)).toBe(100);

    await saveLoyaltyProgram(fixture.company.id, { ...baseProgram, mode: 'CASHBACK' });
    expect(await balanceOf(fixture)).toBe(0);

    await completeAppointment(fixture, '2030-05-02T13:00:00Z');
    expect(await balanceOf(fixture)).toBe(5);

    await expect(
      redeemLoyalty({
        companyId: fixture.company.id,
        clientId: fixture.client.id,
        createdByUserId: 'user_test',
        cashbackAmount: 6,
      }),
    ).rejects.toThrow('insuficiente');

    await redeemLoyalty({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      createdByUserId: 'user_test',
      cashbackAmount: 2.5,
    });
    expect(await balanceOf(fixture)).toBe(2.5);
  });

  it('manual credits count toward the balance and must be whole stamps', async () => {
    await saveLoyaltyProgram(fixture.company.id, {
      ...baseProgram,
      mode: 'STAMPS',
      rewardServiceId: fixture.service.id,
    });

    await addLoyaltyManually({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      amount: 2,
      description: 'Cartão de papel',
      createdByUserId: 'user_test',
    });
    expect(await balanceOf(fixture)).toBe(2);

    await expect(
      addLoyaltyManually({
        companyId: fixture.company.id,
        clientId: fixture.client.id,
        amount: 1.5,
        createdByUserId: 'user_test',
      }),
    ).rejects.toThrow('número inteiro');
  });

  it('credits nothing while paused, and never crosses companies', async () => {
    await saveLoyaltyProgram(fixture.company.id, {
      ...baseProgram,
      active: false,
      mode: 'STAMPS',
      rewardServiceId: fixture.service.id,
    });
    await completeAppointment(fixture, '2030-06-01T13:00:00Z');
    expect(await balanceOf(fixture)).toBe(0);

    const other = await createTestCompany('loyalty-other');
    try {
      await saveLoyaltyProgram(other.company.id, {
        ...baseProgram,
        mode: 'STAMPS',
        rewardServiceId: other.service.id,
      });

      await expect(
        addLoyaltyManually({
          companyId: other.company.id,
          clientId: fixture.client.id,
          amount: 5,
          createdByUserId: 'user_test',
        }),
      ).rejects.toThrow('Cliente não encontrado');
      expect(await getClientLoyalty(other.company.id, fixture.client.id)).toBeNull();

      await expect(
        saveLoyaltyProgram(other.company.id, {
          ...baseProgram,
          mode: 'STAMPS',
          rewardServiceId: fixture.service.id,
        }),
      ).rejects.toThrow('Serviço não encontrado');
    } finally {
      await deleteTestCompany(other.company.id);
    }
  });
});
