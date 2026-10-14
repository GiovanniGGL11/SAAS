import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { calendarDateToUtc } from '@/lib/time';
import { getPeriodInsights, previousRange } from '@/server/data/insights';
import { createTestCompany, deleteTestCompany } from './helpers';

const TZ = 'America/Sao_Paulo';

describe('indicadores do dashboard', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  let companyId: string;
  // Uma segunda-feira inteira no passado: 08/06/2026.
  const day = { year: 2026, month: 6, day: 8 };
  const range = {
    startAt: calendarDateToUtc(day, 0, TZ),
    endAt: calendarDateToUtc({ ...day, day: 9 }, 0, TZ),
  };
  const at = (minutes: number, d = day) => calendarDateToUtc(d, minutes, TZ);

  beforeEach(async () => {
    fixture = await createTestCompany('insights');
    companyId = fixture.company.id;
    // Expediente de segunda: 9h às 17h = 480 min.
    await prisma.professionalAvailability.create({
      data: {
        professionalId: fixture.professional.id,
        weekday: 1,
        startTime: '09:00',
        endTime: '17:00',
      },
    });
  });

  afterEach(async () => {
    await deleteTestCompany(companyId);
  });

  const appointment = (
    start: Date,
    minutes: number,
    status: string,
    clientId = fixture.client.id,
    createdByUserId = 'user',
  ) =>
    prisma.appointment.create({
      data: {
        companyId,
        clientId,
        professionalId: fixture.professional.id,
        serviceId: fixture.service.id,
        startAt: start,
        endAt: new Date(start.getTime() + minutes * 60_000),
        status: status as never,
        priceSnapshot: 50,
        serviceNameSnapshot: 'Corte',
        durationMinutesSnapshot: minutes,
        createdByUserId,
        createdAt: start,
      },
    });

  it('ocupação, retorno, faltas e agendamento online', async () => {
    const newcomer = await prisma.client.create({
      data: { companyId, name: 'Nova', phone: '11900000001' },
    });
    // Cliente da casa: veio em maio e voltou.
    await appointment(at(10 * 60, { year: 2026, month: 5, day: 4 }), 60, 'DONE');
    await appointment(at(9 * 60), 60, 'DONE');
    await appointment(at(11 * 60), 60, 'DONE', newcomer.id, 'online-booking');
    await appointment(at(13 * 60), 60, 'NO_SHOW');
    await appointment(at(15 * 60), 60, 'CANCELED');

    const { current } = await getPeriodInsights(companyId, TZ, range);
    expect(current.completed).toBe(2);
    expect(current.occupancy).toBe(25); // 120 de 480 min
    expect(current.returningRate).toBe(50); // 1 de 2 atendidos já tinha vindo
    expect(current.newClientsServed).toBe(1);
    expect(current.lossRate).toBe(50); // falta + cancelado de 4 no dia
    expect(current.onlineRate).toBe(25); // 1 de 4 criados no dia
  });

  it('bloqueio reduz o tempo disponível', async () => {
    await prisma.scheduleBlock.create({
      data: { professionalId: fixture.professional.id, startAt: at(13 * 60), endAt: at(17 * 60) },
    });
    await appointment(at(9 * 60), 120, 'DONE');
    const { current } = await getPeriodInsights(companyId, TZ, range);
    expect(current.occupancy).toBe(50); // 120 de 240 min
  });

  it('período anterior tem o mesmo tamanho', () => {
    const prev = previousRange(range);
    expect(prev.endAt).toEqual(range.startAt);
    expect(range.startAt.getTime() - prev.startAt.getTime()).toBe(
      range.endAt.getTime() - range.startAt.getTime(),
    );
  });
});
