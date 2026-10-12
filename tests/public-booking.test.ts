import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  createPublicBooking,
  listAvailableSlots,
  signAppointmentToken,
  verifyAppointmentToken,
} from '@/server/data/public-booking';
import { addDays, getTodayInTz } from '@/lib/time';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('agendamento online', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  const tz = 'America/Sao_Paulo';
  // Uma segunda-feira daqui a pelo menos uma semana: sempre no futuro, sempre dia útil.
  const target = (() => {
    let d = addDays(getTodayInTz(tz), 7);
    while (new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() !== 1) d = addDays(d, 1);
    return d;
  })();

  beforeEach(async () => {
    fixture = await createTestCompany('booking');
    await prisma.professionalAvailability.create({
      data: {
        professionalId: fixture.professional.id,
        weekday: 1,
        startTime: '09:00',
        endTime: '12:00',
      },
    });
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  const slots = () =>
    listAvailableSlots({
      companyId: fixture.company.id,
      timezone: tz,
      serviceId: fixture.service.id,
      date: target,
    });

  it('lista só horários dentro do expediente e some com o horário reservado', async () => {
    const before = await slots();
    expect(before.length).toBeGreaterThan(0);
    expect(before[0].label).toBe('09:00');
    expect(before.every((s) => s.label < '12:00')).toBe(true);

    const booked = await createPublicBooking({
      companyId: fixture.company.id,
      timezone: tz,
      serviceId: fixture.service.id,
      professionalId: before[0].professionalId,
      startAt: new Date(before[0].startAt),
      name: 'Maria Online',
      phone: '(11) 97777-6666',
    });
    expect(booked.notes).toContain('online');
    const client = await prisma.client.findUniqueOrThrow({ where: { id: booked.clientId } });
    expect(client.phone).toBe('11977776666');

    const after = await slots();
    expect(after.find((s) => s.label === '09:00')).toBeUndefined();
  });

  it('dois clientes no mesmo horário: só um consegue', async () => {
    const [first] = await slots();
    const book = (phone: string) =>
      createPublicBooking({
        companyId: fixture.company.id,
        timezone: tz,
        serviceId: fixture.service.id,
        professionalId: first.professionalId,
        startAt: new Date(first.startAt),
        name: 'Cliente',
        phone,
      });
    const results = await Promise.allSettled([book('11911111111'), book('11922222222')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('o link de confirmação não aceita token adulterado', () => {
    const token = signAppointmentToken('abc123');
    expect(verifyAppointmentToken(token)).toBe('abc123');
    expect(verifyAppointmentToken(token.replace('abc123', 'xyz999'))).toBeNull();
    expect(verifyAppointmentToken('abc123.falso')).toBeNull();
  });
});
