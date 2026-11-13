import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { countAppointmentsToClose, listAppointmentsToClose } from '@/server/data/to-close';
import { createTestCompany, deleteTestCompany } from './helpers';

describe('atendimentos para fechar', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  const now = new Date();
  const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);

  beforeAll(async () => {
    f = await createTestCompany('to_close');
    const make = (
      startH: number,
      status: 'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'NO_SHOW',
      by = 'u',
    ) =>
      prisma.appointment.create({
        data: {
          companyId: f.company.id,
          clientId: f.client.id,
          professionalId: f.professional.id,
          serviceId: f.service.id,
          startAt: hours(startH),
          endAt: hours(startH + 1),
          status,
          priceSnapshot: 50,
          serviceNameSnapshot: 'Serviço',
          durationMinutesSnapshot: 60,
          createdByUserId: by,
        },
      });
    await make(-5, 'SCHEDULED', 'online-booking'); // passou, em aberto, pelo link → entra
    await make(-26, 'CONFIRMED'); // ontem, confirmado → entra
    await make(-3, 'DONE'); // concluído → não
    await make(-4, 'NO_SHOW'); // faltou → não
    await make(-1.2, 'SCHEDULED'); // acabou há 12 min (margem de 30) → não
    await make(3, 'SCHEDULED'); // futuro → não
    await make(-24 * 70, 'SCHEDULED'); // há 70 dias → fora da janela
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('só os que passaram e continuam em aberto, mais recentes primeiro', async () => {
    expect(await countAppointmentsToClose(f.company.id, now)).toBe(2);
    const list = await listAppointmentsToClose(f.company.id, now);
    expect(list.map((i) => [i.status, i.online])).toEqual([
      ['SCHEDULED', true],
      ['CONFIRMED', false],
    ]);
    expect(list[0].client.name).toBe(f.client.name);
  });
});
