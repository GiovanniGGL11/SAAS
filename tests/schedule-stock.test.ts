import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { createAppointment } from '@/server/data/appointments';
import {
  createAbsence,
  createWeeklyBlock,
  deleteBlockSeries,
  listUpcomingBlocks,
} from '@/server/data/absences';
import { createPurchase } from '@/server/data/purchases';
import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
import { createTestCompany, deleteTestCompany } from './helpers';

const TZ = 'America/Sao_Paulo';

describe('escala e compras de estoque', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  let companyId: string;
  beforeEach(async () => {
    fixture = await createTestCompany('escala');
    companyId = fixture.company.id;
  });
  afterEach(async () => {
    await deleteTestCompany(companyId);
  });

  it('férias: não cria em cima de cliente marcado; sem cliente, bloqueia os dias inteiros', async () => {
    const start = addDays(getTodayInTz(TZ), 20);
    await createAppointment({
      companyId,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: calendarDateToUtc(addDays(start, 1), 10 * 60, TZ),
      createdByUserId: 'u',
    });
    const base = { companyId, professionalId: fixture.professional.id, timezone: TZ, userId: 'u' };
    await expect(createAbsence({ ...base, from: start, to: addDays(start, 3) })).rejects.toThrow(
      /1 atendimento marcado/,
    );

    const later = addDays(start, 10);
    const block = await createAbsence({
      ...base,
      from: later,
      to: addDays(later, 2),
      reason: 'Férias',
    });
    expect(block.startAt).toEqual(calendarDateToUtc(later, 0, TZ));
    expect(block.endAt).toEqual(calendarDateToUtc(addDays(later, 3), 0, TZ));
    const upcoming = await listUpcomingBlocks(companyId, fixture.professional.id, TZ);
    expect(upcoming).toMatchObject([{ reason: 'Férias', allDay: true }]);
  });

  it('bloqueio semanal: pula a semana com cliente e remove a série inteira', async () => {
    const today = getTodayInTz(TZ);
    let monday = addDays(today, 1);
    while (new Date(Date.UTC(monday.year, monday.month - 1, monday.day)).getUTCDay() !== 1)
      monday = addDays(monday, 1);
    await createAppointment({
      companyId,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: calendarDateToUtc(addDays(monday, 7), 12 * 60, TZ),
      createdByUserId: 'u',
    });
    const result = await createWeeklyBlock({
      companyId,
      professionalId: fixture.professional.id,
      weekday: 1,
      startTime: '12:00',
      endTime: '13:00',
      weeks: 3,
      timezone: TZ,
      userId: 'u',
    });
    expect(result.skipped).toHaveLength(1);
    const [series] = await listUpcomingBlocks(companyId, fixture.professional.id, TZ);
    expect(series.seriesId).toBeTruthy();
    expect(series.occurrences).toBe(result.created);
    await deleteBlockSeries(companyId, series.seriesId!, 'u');
    expect(await listUpcomingBlocks(companyId, fixture.professional.id, TZ)).toEqual([]);
  });

  it('compra: soma o estoque, faz custo médio e lança a conta a pagar', async () => {
    const product = await prisma.product.create({
      data: { companyId, name: 'Shampoo', costPrice: 10, salePrice: 30, quantity: 10 },
    });
    const due = new Date(Date.now() + 10 * 86_400_000);
    const { total } = await createPurchase({
      companyId,
      supplier: 'Distribuidora X',
      items: [{ productId: product.id, quantity: 10, unitCost: 14 }],
      payment: { dueDate: due },
      userId: 'u',
    });
    expect(total).toBe(140);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(after.quantity).toBe(20);
    expect(Number(after.costPrice)).toBe(12); // (10×10 + 10×14) ÷ 20
    const bill = await prisma.transaction.findFirstOrThrow({
      where: { companyId, type: 'EXPENSE' },
    });
    expect([bill.status, Number(bill.amount), bill.category]).toEqual([
      'PENDING',
      140,
      'Produtos e insumos',
    ]);
  });
});
