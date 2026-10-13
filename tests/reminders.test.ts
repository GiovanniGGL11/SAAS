import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { addDays, startOfCalendarDateUtc, utcToCalendarDate } from '@/lib/time';
import { buildReminderMessage, sendEmailReminders } from '@/server/data/reminders';
import type { EmailMessage } from '@/server/email';
import { createTestCompany, deleteTestCompany } from './helpers';

type Fixture = Awaited<ReturnType<typeof createTestCompany>>;

function tomorrowAt(timezone: string, hour: number, dayOffset = 1) {
  const day = addDays(utcToCalendarDate(new Date(), timezone), dayOffset);
  return new Date(startOfCalendarDateUtc(day, timezone).getTime() + hour * 3_600_000);
}

async function book(f: Fixture, startAt: Date, status: 'SCHEDULED' | 'CANCELED' = 'SCHEDULED') {
  return prisma.appointment.create({
    data: {
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId: f.professional.id,
      serviceId: f.service.id,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status,
      serviceNameSnapshot: f.service.name,
      durationMinutesSnapshot: 30,
      priceSnapshot: 50,
      createdByUserId: 'user_test',
    },
  });
}

describe('lembretes da véspera', () => {
  let a: Fixture;
  let b: Fixture;

  beforeAll(async () => {
    process.env.BOOKING_LINK_SECRET ||= 'test-secret-000000000000000000000000';
    a = await createTestCompany('reminders_a');
    b = await createTestCompany('reminders_b');
    await prisma.client.update({ where: { id: a.client.id }, data: { email: 'ana@example.com' } });
    await prisma.client.update({ where: { id: b.client.id }, data: { email: 'bia@example.com' } });
  });
  afterAll(async () => {
    await deleteTestCompany(a.company.id);
    await deleteTestCompany(b.company.id);
  });

  it('o texto traz dia, hora, serviço, profissional e o link de confirmação', () => {
    const text = buildReminderMessage(
      {
        id: 'x',
        startAt: new Date('2031-03-12T13:00:00Z'),
        serviceNameSnapshot: 'Corte',
        client: { name: 'Maria da Silva' },
        professional: { name: 'Ana' },
      },
      { name: 'Studio Lua', timezone: 'America/Sao_Paulo' },
      'https://app.test/confirmar/abc',
    );
    expect(text).toContain('Olá, Maria!');
    expect(text).toContain('Studio Lua');
    expect(text).toContain('10:00');
    expect(text).toContain('Corte com Ana');
    expect(text).toContain('https://app.test/confirmar/abc');
  });

  it('manda uma vez só, só para amanhã, só quem tem e-mail e só para quem ligou o recurso', async () => {
    const tz = a.company.timezone;
    const tomorrow = await book(a, tomorrowAt(tz, 14));
    const canceled = await book(a, tomorrowAt(tz, 15), 'CANCELED');
    const later = await book(a, tomorrowAt(tz, 14, 3));
    const otherCompany = await book(b, tomorrowAt(tz, 14));

    const send = vi.fn(async (_message: EmailMessage) => {});

    // Recurso desligado: nada sai.
    expect((await sendEmailReminders(send, 'https://app.test')).sent).toBe(0);

    await prisma.company.update({ where: { id: a.company.id }, data: { remindersByEmail: true } });
    const first = await sendEmailReminders(send, 'https://app.test');
    expect(first).toMatchObject({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'ana@example.com' });
    expect(send.mock.calls[0][0].text).toContain('https://app.test/confirmar/');

    expect(
      (await prisma.appointment.findUnique({ where: { id: tomorrow.id } }))?.reminderSentAt,
    ).not.toBeNull();
    for (const untouched of [canceled, later, otherCompany]) {
      expect(
        (await prisma.appointment.findUnique({ where: { id: untouched.id } }))?.reminderSentAt,
      ).toBeNull();
    }

    // Segunda rodada no mesmo dia: não repete.
    expect((await sendEmailReminders(send, 'https://app.test')).sent).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('falha no envio não marca como enviado (tenta de novo na próxima)', async () => {
    const tz = a.company.timezone;
    const appt = await book(a, tomorrowAt(tz, 16));
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await sendEmailReminders(failing, 'https://app.test');
    expect(result.failed).toBe(1);
    expect(
      (await prisma.appointment.findUnique({ where: { id: appt.id } }))?.reminderSentAt,
    ).toBeNull();
  });
});
