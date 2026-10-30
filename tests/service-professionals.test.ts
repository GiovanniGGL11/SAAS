import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
import { createAppointment, moveAppointment } from '@/server/data/appointments';
import { getBookingCatalog, listAvailableSlots } from '@/server/data/public-booking';
import {
  ProfessionalNotForServiceError,
  saveServiceStaffing,
} from '@/server/data/service-professionals';
import { createTestCompany, deleteTestCompany } from './helpers';

const tz = 'America/Sao_Paulo';

describe('quem faz cada serviço e o preço de cada profissional', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let other: Awaited<ReturnType<typeof createTestCompany>>;
  let ana: { id: string };
  let bia: { id: string };
  let caio: { id: string };
  // Uma quarta entre 7 e 13 dias à frente; todos atendem 09h–12h.
  const day = (() => {
    let x = addDays(getTodayInTz(tz), 7);
    while (new Date(Date.UTC(x.year, x.month - 1, x.day)).getUTCDay() !== 3) x = addDays(x, 1);
    return x;
  })();
  const at = (h: number, m = 0) => calendarDateToUtc(day, h * 60 + m, tz);

  beforeAll(async () => {
    f = await createTestCompany('staffing');
    other = await createTestCompany('staffing_b');
    ana = f.professional;
    const mk = (name: string) =>
      prisma.professional.create({
        data: { companyId: f.company.id, name, color: '#888888' },
      });
    bia = await mk('Bia (teste)');
    caio = await mk('Caio (teste)');
    await prisma.professionalAvailability.createMany({
      data: [ana.id, bia.id, caio.id].map((professionalId) => ({
        professionalId,
        weekday: 3,
        startTime: '09:00',
        endTime: '12:00',
      })),
    });
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
    await deleteTestCompany(other.company.id);
  });

  const book = (professionalId: string, startAt: Date) =>
    createAppointment({
      companyId: f.company.id,
      clientId: f.client.id,
      professionalId,
      serviceId: f.service.id, // R$ 50
      startAt,
      createdByUserId: 'u',
    });

  it('sem lista, todos fazem pelo preço do serviço (como sempre foi)', async () => {
    const a = await book(caio.id, at(9));
    expect(Number(a.priceSnapshot)).toBe(50);
  });

  it('com lista: só quem está nela faz, cada um com o seu preço', async () => {
    await saveServiceStaffing(f.company.id, f.service.id, [
      { professionalId: ana.id, price: 80 },
      { professionalId: bia.id, price: null },
    ]);

    expect(Number((await book(ana.id, at(10))).priceSnapshot)).toBe(80);
    expect(Number((await book(bia.id, at(10))).priceSnapshot)).toBe(50);
    await expect(book(caio.id, at(11))).rejects.toBeInstanceOf(ProfessionalNotForServiceError);

    // Mover para quem não faz o serviço é recusado.
    const moving = await book(bia.id, at(11));
    await expect(
      moveAppointment({
        companyId: f.company.id,
        id: moving.id,
        startAt: at(11),
        professionalId: caio.id,
        updatedByUserId: 'u',
      }),
    ).rejects.toBeInstanceOf(ProfessionalNotForServiceError);

    // Link público: o catálogo diz quem faz e por quanto; os horários são só de quem faz.
    const catalog = await getBookingCatalog(f.company.id);
    const svc = catalog.services.find((s) => s.id === f.service.id)!;
    expect(new Set(svc.professionalIds)).toEqual(new Set([ana.id, bia.id]));
    expect(svc.prices).toEqual({ [ana.id]: 80 });
    const slots = await listAvailableSlots({
      companyId: f.company.id,
      timezone: tz,
      serviceId: f.service.id,
      date: day,
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.professionalId !== caio.id)).toBe(true);
    expect(
      await listAvailableSlots({
        companyId: f.company.id,
        timezone: tz,
        serviceId: f.service.id,
        professionalId: caio.id,
        date: day,
      }),
    ).toEqual([]);
  });

  it('não aceita profissional de outra empresa; lista vazia volta para "todos"', async () => {
    await expect(
      saveServiceStaffing(f.company.id, f.service.id, [
        { professionalId: other.professional.id, price: 10 },
      ]),
    ).rejects.toThrow(/não encontrado/);
    await saveServiceStaffing(f.company.id, f.service.id, []);
    const svc = (await getBookingCatalog(f.company.id)).services.find(
      (s) => s.id === f.service.id,
    )!;
    expect(svc.professionalIds).toBeNull();
    expect(Number((await book(caio.id, at(11, 30))).priceSnapshot)).toBe(50);
  });
});
