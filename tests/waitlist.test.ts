import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { getTodayInTz } from '@/lib/time';
import {
  createWaitlistEntry,
  listWaitingEntries,
  setWaitlistEntryStatus,
} from '@/server/data/waitlist';
import { createTestCompany, deleteTestCompany } from './helpers';

type Fixture = Awaited<ReturnType<typeof createTestCompany>>;

function dayKey(offset: number, timezone: string) {
  const today = getTodayInTz(timezone);
  const d = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
  return d.toISOString().slice(0, 10);
}

describe('lista de espera', () => {
  let a: Fixture;
  let b: Fixture;

  beforeAll(async () => {
    a = await createTestCompany('waitlist_a');
    b = await createTestCompany('waitlist_b');
  });
  afterAll(async () => {
    await deleteTestCompany(a.company.id);
    await deleteTestCompany(b.company.id);
  });

  it('entra na fila, aparece na lista e some ao ser atendida', async () => {
    const tz = a.company.timezone;
    const entry = await createWaitlistEntry(a.company.id, tz, 'user_a', {
      clientId: a.client.id,
      serviceId: a.service.id,
      desiredDate: dayKey(1, tz),
      notes: '  de manhã  ',
    });
    expect(entry.notes).toBe('de manhã');
    expect(entry.client.name).toBe(a.client.name);

    expect((await listWaitingEntries(a.company.id, tz)).map((e) => e.id)).toContain(entry.id);

    await setWaitlistEntryStatus(a.company.id, entry.id, 'FULFILLED');
    expect((await listWaitingEntries(a.company.id, tz)).map((e) => e.id)).not.toContain(entry.id);
    await expect(setWaitlistEntryStatus(a.company.id, entry.id, 'CANCELED')).rejects.toThrow(
      /não está mais/,
    );
  });

  it('recusa dia passado e cliente repetido no mesmo dia', async () => {
    const tz = a.company.timezone;
    await expect(
      createWaitlistEntry(a.company.id, tz, 'user_a', {
        clientId: a.client.id,
        serviceId: a.service.id,
        desiredDate: dayKey(-1, tz),
      }),
    ).rejects.toThrow(/já passou/);

    const input = { clientId: a.client.id, serviceId: a.service.id, desiredDate: dayKey(2, tz) };
    await createWaitlistEntry(a.company.id, tz, 'user_a', input);
    await expect(createWaitlistEntry(a.company.id, tz, 'user_a', input)).rejects.toThrow(
      /já está na lista/,
    );
  });

  it('não mistura empresas', async () => {
    const tz = a.company.timezone;
    await expect(
      createWaitlistEntry(a.company.id, tz, 'user_a', {
        clientId: b.client.id,
        serviceId: a.service.id,
        desiredDate: dayKey(3, tz),
      }),
    ).rejects.toThrow(/não pertence/);
    await expect(
      createWaitlistEntry(a.company.id, tz, 'user_a', {
        clientId: a.client.id,
        serviceId: a.service.id,
        professionalId: b.professional.id,
        desiredDate: dayKey(3, tz),
      }),
    ).rejects.toThrow(/não pertence/);

    const mine = await createWaitlistEntry(a.company.id, tz, 'user_a', {
      clientId: a.client.id,
      serviceId: a.service.id,
      desiredDate: dayKey(4, tz),
    });
    expect((await listWaitingEntries(b.company.id, tz)).length).toBe(0);
    await expect(setWaitlistEntryStatus(b.company.id, mine.id, 'CANCELED')).rejects.toThrow();
    expect(await prisma.waitlistEntry.count({ where: { id: mine.id, status: 'WAITING' } })).toBe(1);
  });
});
