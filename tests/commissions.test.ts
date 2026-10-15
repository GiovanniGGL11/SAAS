import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { checkoutAppointment, createAppointment } from '@/server/data/appointments';
import {
  closeCommission,
  computeCommissions,
  createAdvance,
  getCommissionOverview,
  reopenCommission,
} from '@/server/data/commissions';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('fechamento de comissão', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  let companyId: string;
  const range = {
    startAt: new Date('2030-08-01T03:00:00Z'),
    endAt: new Date('2030-09-01T03:00:00Z'),
  };

  beforeEach(async () => {
    fixture = await createTestCompany('commission');
    companyId = fixture.company.id;
    await prisma.professional.update({
      where: { id: fixture.professional.id },
      data: { commissionType: 'PERCENTAGE', commissionValue: 40 },
    });
    // Barba com comissão própria de 50%; o serviço do fixture (R$ 50) segue a regra de 40%.
    const beard = await prisma.service.create({
      data: {
        companyId,
        name: 'Barba',
        durationMinutes: 20,
        price: 30,
        color: '#000',
        commissionPercent: 50,
      },
    });
    const appointment = await createAppointment({
      companyId,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      extraServiceIds: [beard.id],
      startAt: new Date('2030-08-10T13:00:00Z'),
      createdByUserId: 'user_test',
    });
    // R$ 80 com R$ 8 de desconto: cobrado R$ 72 → R$ 45 no serviço e R$ 27 na barba.
    await checkoutAppointment({
      companyId,
      id: appointment.id,
      paymentMethod: 'PIX',
      discount: 8,
      tip: 10,
      updatedByUserId: 'user_test',
    });
  });

  afterEach(async () => {
    await deleteTestCompany(companyId);
  });

  it('% por serviço, rateio do cobrado e gorjeta fora da base', async () => {
    const [line] = await computeCommissions(companyId, range, [fixture.professional.id]);
    expect(line.base).toBe(72);
    expect(line.commission).toBe(31.5); // 45 × 40% + 27 × 50%
    expect(line.appointments).toBe(1);
  });

  it('desconta vales, lança o pagamento, não fecha duas vezes e pode ser desfeito', async () => {
    await createAdvance({
      companyId,
      professionalId: fixture.professional.id,
      amount: 10,
      paymentMethod: 'CASH',
      userId: 'user_test',
    });
    let [overview] = await getCommissionOverview(companyId, range);
    expect(overview.openAdvances).toBe(10);

    const result = await closeCommission({
      companyId,
      professionalId: fixture.professional.id,
      range,
      paymentMethod: 'PIX',
      userId: 'user_test',
      label: 'Agosto de 2030',
    });
    expect(result).toEqual({ gross: 31.5, advancesTotal: 10, net: 21.5 });

    const expenses = await prisma.transaction.findMany({
      where: { companyId, type: 'EXPENSE', category: 'Comissões', status: 'PAID' },
      orderBy: { amount: 'asc' },
    });
    // O vale (R$ 10) e o pagamento (R$ 21,50): no DRE, a comissão total é R$ 31,50.
    expect(expenses.map((t) => Number(t.amount))).toEqual([10, 21.5]);

    [overview] = await getCommissionOverview(companyId, range);
    expect(overview.payout?.netAmount).toBe(21.5);
    expect(overview.openAdvances).toBe(0);

    await expect(
      closeCommission({
        companyId,
        professionalId: fixture.professional.id,
        range,
        paymentMethod: 'PIX',
        userId: 'user_test',
        label: 'x',
      }),
    ).rejects.toThrow(/já foi fechada/);

    await reopenCommission(companyId, overview.payout!.id);
    [overview] = await getCommissionOverview(companyId, range);
    expect(overview.payout).toBeNull();
    expect(overview.openAdvances).toBe(10);
    const canceled = await prisma.transaction.count({
      where: { companyId, category: 'Comissões', status: 'CANCELED' },
    });
    expect(canceled).toBe(1);
  });

  it('não fecha com vales maiores que a comissão', async () => {
    await createAdvance({
      companyId,
      professionalId: fixture.professional.id,
      amount: 50,
      paymentMethod: 'CASH',
      userId: 'user_test',
    });
    await expect(
      closeCommission({
        companyId,
        professionalId: fixture.professional.id,
        range,
        paymentMethod: 'PIX',
        userId: 'user_test',
        label: 'x',
      }),
    ).rejects.toThrow(/passam da comissão/);
  });
});
