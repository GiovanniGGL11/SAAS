import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  countBookableProfessionals,
  createPublicBooking,
  getBookingCatalog,
  listAvailableSlots,
  listProfessionalsWithoutSchedule,
  signAppointmentToken,
  verifyAppointmentToken,
} from '@/server/data/public-booking';
import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
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

  it('quem não tem expediente cadastrado não recebe horário nenhum', async () => {
    const semExpediente = await prisma.professional.create({
      data: { companyId: fixture.company.id, name: 'Sem expediente', color: '#ff0000' },
    });
    const todos = await slots();
    expect(todos.every((s) => s.professionalId !== semExpediente.id)).toBe(true);

    const soEle = await listAvailableSlots({
      companyId: fixture.company.id,
      timezone: tz,
      serviceId: fixture.service.id,
      professionalId: semExpediente.id,
      date: target,
    });
    expect(soEle).toEqual([]);

    // E ele nem aparece na lista do link público.
    const catalog = await getBookingCatalog(fixture.company.id);
    expect(catalog.professionals.map((p) => p.id)).toEqual([fixture.professional.id]);
    expect(await listProfessionalsWithoutSchedule(fixture.company.id)).toEqual(['Sem expediente']);
    expect(await countBookableProfessionals(fixture.company.id)).toBe(1);
  });

  it('sem nenhum expediente na empresa, o link não libera reserva', async () => {
    await prisma.professionalAvailability.deleteMany({
      where: { professionalId: fixture.professional.id },
    });
    expect(await slots()).toEqual([]);
    expect((await getBookingCatalog(fixture.company.id)).professionals).toEqual([]);
    expect(await countBookableProfessionals(fixture.company.id)).toBe(0);
  });

  it('o servidor recusa horário fora do expediente, mesmo pedido à mão', async () => {
    const book = (startAt: Date, professionalId = fixture.professional.id) =>
      createPublicBooking({
        companyId: fixture.company.id,
        timezone: tz,
        serviceId: fixture.service.id,
        professionalId,
        startAt,
        name: 'Cliente',
        phone: '11933334444',
      });
    const at = (hour: number, minute = 0) => calendarDateToUtc(target, hour * 60 + minute, tz);

    // Segunda-feira, mas fora das 09h–12h.
    await expect(book(at(7))).rejects.toThrow('não está mais disponível');
    await expect(book(at(13))).rejects.toThrow('não está mais disponível');
    // Fora da grade de 15 minutos.
    await expect(book(at(9, 7))).rejects.toThrow('não está mais disponível');
    // Terminaria depois das 12h (o serviço dura 30 min).
    await expect(book(at(11, 45))).rejects.toThrow('não está mais disponível');
    // Profissional sem expediente.
    const semExpediente = await prisma.professional.create({
      data: { companyId: fixture.company.id, name: 'Sem expediente', color: '#ff0000' },
    });
    await expect(book(at(10), semExpediente.id)).rejects.toThrow('não está mais disponível');
    // Nada foi gravado.
    expect(await prisma.appointment.count({ where: { companyId: fixture.company.id } })).toBe(0);

    // Dentro do expediente passa.
    await expect(book(at(11, 30))).resolves.toBeTruthy();
  });

  it('o link de confirmação não aceita token adulterado', () => {
    const token = signAppointmentToken('abc123');
    expect(verifyAppointmentToken(token)).toBe('abc123');
    expect(verifyAppointmentToken(token.replace('abc123', 'xyz999'))).toBeNull();
    expect(verifyAppointmentToken('abc123.falso')).toBeNull();
  });
});
