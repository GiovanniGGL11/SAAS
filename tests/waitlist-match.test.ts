import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
import { cancelAppointment, createAppointment } from '@/server/data/appointments';
import { findOpenSlotsForWaitlist, findWaitlistMatchesForFreedSlot } from '@/server/data/waitlist';
import { createTestCompany, deleteTestCompany } from './helpers';

const tz = 'America/Sao_Paulo';
const target = addDays(getTodayInTz(tz), 3);
const key = `${target.year}-${String(target.month).padStart(2, '0')}-${String(target.day).padStart(2, '0')}`;
const at = (hour: number) => calendarDateToUtc(target, hour * 60, tz);

describe('lista de espera: encaixe', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;

  beforeEach(async () => {
    fixture = await createTestCompany('encaixe');
    // Expediente curto (10h–11h) para a vaga só existir quando alguém cancelar.
    await prisma.professionalAvailability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        professionalId: fixture.professional.id,
        weekday,
        startTime: '10:00',
        endTime: '11:00',
      })),
    });
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  it('acha quem combina com a vaga que abriu e mostra a vaga na lista', async () => {
    const companyId = fixture.company.id;
    // Dia cheio: 10:00 e 10:30 ocupados.
    const [first] = await Promise.all([
      createAppointment({
        companyId,
        clientId: fixture.client.id,
        professionalId: fixture.professional.id,
        serviceId: fixture.service.id,
        startAt: at(10),
        createdByUserId: 'user_test',
      }),
    ]);
    await createAppointment({
      companyId,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: calendarDateToUtc(target, 10 * 60 + 30, tz),
      createdByUserId: 'user_test',
    });

    const [waiting, other] = await Promise.all([
      prisma.client.create({ data: { companyId, name: 'Bia Espera', phone: '11955554444' } }),
      prisma.professional.create({ data: { companyId, name: 'Outro', color: '#ff0000' } }),
    ]);
    const [entry, wrongProfessional] = await Promise.all([
      prisma.waitlistEntry.create({
        data: {
          companyId,
          clientId: waiting.id,
          serviceId: fixture.service.id,
          desiredDate: key,
          createdByUserId: 'user_test',
        },
      }),
      prisma.waitlistEntry.create({
        data: {
          companyId,
          clientId: fixture.client.id,
          serviceId: fixture.service.id,
          professionalId: other.id,
          desiredDate: key,
          createdByUserId: 'user_test',
        },
      }),
    ]);

    // Antes de cancelar: dia cheio, ninguém tem vaga.
    expect((await findOpenSlotsForWaitlist(companyId, tz))[entry.id]).toEqual([]);

    const canceled = await cancelAppointment({
      companyId,
      id: first.id,
      canceledByUserId: 'user_test',
    });
    const matches = await findWaitlistMatchesForFreedSlot(companyId, tz, canceled);
    expect(matches.map((m) => m.entryId)).toEqual([entry.id]); // o outro pediu outro profissional
    expect(matches[0].label).toBe('10:00');
    expect(matches[0].message).toContain('às 10:00');
    expect(matches.some((m) => m.entryId === wrongProfessional.id)).toBe(false);

    // E a lista passa a mostrar a vaga para quem espera.
    const slots = await findOpenSlotsForWaitlist(companyId, tz);
    expect(slots[entry.id].map((s) => s.label)).toEqual(['10:00']);

    // Outra empresa não enxerga a lista desta.
    expect(await findWaitlistMatchesForFreedSlot('empresa-de-outra-pessoa', tz, canceled)).toEqual(
      [],
    );
  });
});
