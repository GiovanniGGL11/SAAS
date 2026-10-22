import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { clashesWithBuffer } from '@/lib/buffer';
import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
import {
  AppointmentConflictError,
  createAppointment,
  findNextAvailableSlot,
  moveAppointment,
} from '@/server/data/appointments';
import { listAvailableSlots } from '@/server/data/public-booking';
import { createTestCompany, deleteTestCompany } from './helpers';

const tz = 'America/Sao_Paulo';
const d = (h: number, m = 0) => new Date(Date.UTC(2030, 0, 1, h, m));

describe('intervalo de preparo: regra', () => {
  it('choque considera o preparo dos dois lados; encostar no fim do preparo pode', () => {
    const a = { startAt: d(10), endAt: d(10, 30), bufferMinutes: 15 };
    expect(clashesWithBuffer(a, { startAt: d(10, 30), endAt: d(11) })).toBe(true);
    expect(clashesWithBuffer(a, { startAt: d(10, 45), endAt: d(11) })).toBe(false);
    // O preparo do novo também não pode invadir o próximo.
    expect(clashesWithBuffer({ startAt: d(9, 30), endAt: d(10), bufferMinutes: 10 }, a)).toBe(true);
    expect(clashesWithBuffer({ startAt: d(9, 20), endAt: d(9, 50), bufferMinutes: 10 }, a)).toBe(
      false,
    );
    expect(clashesWithBuffer({ startAt: d(9), endAt: d(10) }, a)).toBe(false);
  });
});

describe('intervalo de preparo: agenda, link público e próximo horário', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  // Uma terça entre 7 e 13 dias à frente.
  const day = (() => {
    let x = addDays(getTodayInTz(tz), 7);
    while (new Date(Date.UTC(x.year, x.month - 1, x.day)).getUTCDay() !== 2) x = addDays(x, 1);
    return x;
  })();
  const at = (h: number, m = 0) => calendarDateToUtc(day, h * 60 + m, tz);

  beforeAll(async () => {
    f = await createTestCompany('buffer');
    // Serviço de 30 min com 15 min de preparo; expediente 09h–12h.
    await prisma.service.update({ where: { id: f.service.id }, data: { bufferMinutes: 15 } });
    await prisma.professionalAvailability.create({
      data: { professionalId: f.professional.id, weekday: 2, startTime: '09:00', endTime: '12:00' },
    });
    await prisma.company.update({ where: { id: f.company.id }, data: { bookingSlotStep: 15 } });
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  const book = (startAt: Date) =>
    createAppointment({
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId: f.professional.id,
      serviceId: f.service.id,
      startAt,
      createdByUserId: 'u',
    });

  it('guarda o preparo no atendimento e não encaixa ninguém nele', async () => {
    const first = await book(at(10));
    expect(first.bufferMinutes).toBe(15);
    // 10:30 cai no preparo do anterior; 10:45 pode.
    await expect(book(at(10, 30))).rejects.toBeInstanceOf(AppointmentConflictError);
    // 09:30–10:00 + 15 de preparo invadiria o das 10:00.
    await expect(book(at(9, 30))).rejects.toBeInstanceOf(AppointmentConflictError);
    const second = await book(at(10, 45));

    // Link público: some 09:30, 10:00, 10:15, 10:30, 10:45, 11:00 (preparo até 11:30).
    const labels = (
      await listAvailableSlots({
        companyId: f.company.id,
        timezone: tz,
        serviceId: f.service.id,
        date: day,
      })
    ).map((s) => s.label);
    expect(labels).toEqual(['09:00', '09:15', '11:30']);

    // Próximo horário livre a partir das 10:00: 11:30.
    const next = await findNextAvailableSlot({
      companyId: f.company.id,
      serviceId: f.service.id,
      from: at(10),
      timezone: tz,
    });
    expect(next?.startAt.toISOString()).toBe(at(11, 30).toISOString());

    // Mover respeita o preparo do próprio atendimento.
    await expect(
      moveAppointment({
        companyId: f.company.id,
        id: second.id,
        startAt: at(9, 30),
        updatedByUserId: 'u',
      }),
    ).rejects.toBeInstanceOf(AppointmentConflictError);
    await moveAppointment({
      companyId: f.company.id,
      id: second.id,
      startAt: at(9),
      updatedByUserId: 'u',
    });
  });
});
