import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { slotFitsEntry } from '@/lib/waitlist';
import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
import { createAppointment } from '@/server/data/appointments';
import { listAvailableSlots } from '@/server/data/public-booking';
import {
  createWaitlistEntry,
  createWaitlistOffer,
  findOpenSlotsForWaitlist,
  findWaitlistMatchesForFreedSlot,
  respondWaitlistOffer,
} from '@/server/data/waitlist';
import { createTestCompany, deleteTestCompany } from './helpers';

/** Lista de espera com convites: horário guardado, aceite único, prazo. Dados fictícios. */
describe('lista de espera com convites', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: Awaited<ReturnType<typeof createTestCompany>>;
  const tz = 'America/Sao_Paulo';
  // Daqui a 3 dias, num dia útil qualquer: expediente aberto todos os dias para o teste.
  const day = addDays(getTodayInTz(tz), 3);
  const at = (minutes: number) => calendarDateToUtc(day, minutes, tz);
  const dayKey = `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;

  beforeAll(async () => {
    f = await createTestCompany('wl_a');
    other = await createTestCompany('wl_b');
    await prisma.professionalAvailability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        professionalId: f.professional.id,
        weekday,
        startTime: '08:00',
        endTime: '18:00',
      })),
    });
  });

  afterAll(async () => {
    await deleteTestCompany(f.company.id);
    await deleteTestCompany(other.company.id);
  });

  it('preferências: profissional, dia da semana, faixa de horário e validade', () => {
    const base = {
      professionalId: null,
      acceptedProfessionalIds: ['p1'],
      desiredDate: null,
      weekdays: [] as number[],
      timeFrom: 8 * 60,
      timeTo: 12 * 60,
      validUntil: null,
    };
    const slot = (h: number, pro = 'p1') => ({
      professionalId: pro,
      startAt: at(h * 60),
      endAt: at(h * 60 + 30),
    });
    expect(slotFitsEntry(base, slot(9), tz)).toBe(true);
    expect(slotFitsEntry(base, slot(9, 'p2'), tz)).toBe(false);
    expect(slotFitsEntry(base, slot(12), tz)).toBe(false); // termina 12:30, passa da faixa
    expect(slotFitsEntry({ ...base, validUntil: at(0) }, slot(9), tz)).toBe(false);
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    expect(slotFitsEntry({ ...base, weekdays: [(weekday + 1) % 7] }, slot(9), tz)).toBe(false);
  });

  it('convite guarda o horário: link público e agenda não oferecem; dois aceites criam um agendamento só', async () => {
    const entry = await createWaitlistEntry(f.company.id, tz, 'u', {
      clientId: f.client.id,
      serviceId: f.service.id,
      acceptedProfessionalIds: [f.professional.id],
      timeFrom: 9 * 60,
      timeTo: 11 * 60,
    });
    const open = await findOpenSlotsForWaitlist(f.company.id, tz);
    expect(open[entry.id].length).toBeGreaterThan(0);
    expect(open[entry.id].every((s) => s.label >= '09:00' && s.label < '11:00')).toBe(true);

    const startAt = at(9 * 60);
    const { offer } = await createWaitlistOffer({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      entryId: entry.id,
      professionalId: f.professional.id,
      startAt,
      responseMinutes: 60,
    });
    // O horário saiu da lista pública.
    const slots = await listAvailableSlots({
      companyId: f.company.id,
      timezone: tz,
      serviceId: f.service.id,
      professionalId: f.professional.id,
      date: day,
    });
    expect(slots.some((s) => s.startAt === startAt.toISOString())).toBe(false);
    // A agenda da equipe também respeita a reserva.
    await expect(
      createAppointment({
        companyId: f.company.id,
        clientId: f.client.id,
        professionalId: f.professional.id,
        serviceId: f.service.id,
        startAt,
        createdByUserId: 'u',
      }),
    ).rejects.toThrow(/reservado para um convite/);
    // Segundo convite para a mesma pessoa é recusado.
    await expect(
      createWaitlistOffer({
        companyId: f.company.id,
        timezone: tz,
        userId: 'u',
        entryId: entry.id,
        professionalId: f.professional.id,
        startAt: at(10 * 60),
        responseMinutes: 60,
      }),
    ).rejects.toThrow(/já tem um convite/);
    // Outra empresa não responde.
    await expect(
      respondWaitlistOffer({
        companyId: other.company.id,
        offerId: offer.id,
        accept: true,
        actorUserId: 'x',
      }),
    ).rejects.toThrow(/não encontrado/);

    const results = await Promise.allSettled([
      respondWaitlistOffer({
        companyId: f.company.id,
        offerId: offer.id,
        accept: true,
        actorUserId: 'u',
      }),
      respondWaitlistOffer({
        companyId: f.company.id,
        offerId: offer.id,
        accept: true,
        actorUserId: 'u',
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const appointments = await prisma.appointment.findMany({
      where: { companyId: f.company.id, startAt },
    });
    expect(appointments).toHaveLength(1);
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe(
      'FULFILLED',
    );
  });

  it('o mesmo horário não vai para duas pessoas; prazo vencido libera e não agenda', async () => {
    const make = async () => {
      const c = await prisma.client.create({
        data: {
          companyId: f.company.id,
          name: 'Espera (teste)',
          phone: `+1556${Math.random().toString().slice(2, 9)}`,
        },
      });
      return createWaitlistEntry(f.company.id, tz, 'u', {
        clientId: c.id,
        serviceId: f.service.id,
        desiredDate: dayKey,
      });
    };
    const [a, b] = [await make(), await make()];
    const startAt = at(14 * 60);
    const first = await createWaitlistOffer({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      entryId: a.id,
      professionalId: f.professional.id,
      startAt,
      responseMinutes: 30,
    });
    await expect(
      createWaitlistOffer({
        companyId: f.company.id,
        timezone: tz,
        userId: 'u',
        entryId: b.id,
        professionalId: f.professional.id,
        startAt,
        responseMinutes: 30,
      }),
    ).rejects.toThrow(/não está mais livre|outra pessoa/);
    // A vaga aberta não é sugerida a quem já tem convite pendente.
    const matches = await findWaitlistMatchesForFreedSlot(f.company.id, tz, {
      professionalId: f.professional.id,
      startAt: at(15 * 60),
      endAt: at(15 * 60 + 30),
    });
    expect(matches.map((m) => m.entryId)).not.toContain(a.id);
    expect(matches.map((m) => m.entryId)).toContain(b.id);

    // Prazo vence: aceitar depois não agenda e o horário volta a ficar livre.
    await prisma.waitlistOffer.update({
      where: { id: first.offer.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      respondWaitlistOffer({
        companyId: f.company.id,
        offerId: first.offer.id,
        accept: true,
        actorUserId: 'u',
      }),
    ).rejects.toThrow(/prazo/);
    expect(await prisma.appointment.count({ where: { companyId: f.company.id, startAt } })).toBe(0);
    const again = await createWaitlistOffer({
      companyId: f.company.id,
      timezone: tz,
      userId: 'u',
      entryId: b.id,
      professionalId: f.professional.id,
      startAt,
      responseMinutes: 30,
    });
    expect(again.offer.status).toBe('PENDING');
  });
});
