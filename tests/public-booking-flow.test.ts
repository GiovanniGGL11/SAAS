import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  SlotUnavailableError,
  createPublicBooking,
  listAvailabilityRange,
  listAvailableSlots,
} from '@/server/data/public-booking';
import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
import { dateKey } from '@/lib/booking';
import { createTestCompany, deleteTestCompany } from './helpers';

const tz = 'America/Sao_Paulo';
// Uma segunda-feira entre 7 e 13 dias à frente: sempre dentro da janela de 21 dias.
const monday = (() => {
  let d = addDays(getTodayInTz(tz), 7);
  while (new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
})();
const at = (hour: number, minute = 0) => calendarDateToUtc(monday, hour * 60 + minute, tz);

describe('agendamento público: regras do novo fluxo', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;

  beforeEach(async () => {
    fixture = await createTestCompany('fluxo');
    // Segunda: 09h–12h e 14h–18h (almoço no meio). Terça: madrugada, 02h–05h.
    await prisma.professionalAvailability.createMany({
      data: [
        { weekday: 1, startTime: '09:00', endTime: '12:00' },
        { weekday: 1, startTime: '14:00', endTime: '18:00' },
        { weekday: 2, startTime: '02:00', endTime: '05:00' },
      ].map((a) => ({ ...a, professionalId: fixture.professional.id })),
    });
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  const book = (startAt: Date, phone = '(11) 97777-6666', name = 'Maria Online') =>
    createPublicBooking({
      companyId: fixture.company.id,
      timezone: tz,
      serviceId: fixture.service.id,
      professionalId: fixture.professional.id,
      startAt,
      name,
      phone,
    });

  it('a semana inteira numa consulta dá o mesmo resultado que dia a dia', async () => {
    const range = await listAvailabilityRange({
      companyId: fixture.company.id,
      timezone: tz,
      serviceId: fixture.service.id,
      from: monday,
      days: 7,
    });
    expect([...range.keys()]).toHaveLength(7);
    for (let i = 0; i < 7; i++) {
      const day = addDays(monday, i);
      const single = await listAvailableSlots({
        companyId: fixture.company.id,
        timezone: tz,
        serviceId: fixture.service.id,
        date: day,
      });
      expect(range.get(dateKey(day))).toEqual(single);
    }
  });

  it('respeita expediente, intervalo, duração e o fuso da empresa', async () => {
    const slots = await listAvailableSlots({
      companyId: fixture.company.id,
      timezone: tz,
      serviceId: fixture.service.id,
      date: monday,
    });
    const labels = slots.map((s) => s.label);
    // Serviço de 30 min: último horário da manhã é 11:30 (termina 12:00); nada no almoço.
    expect(labels[0]).toBe('09:00');
    expect(labels).toContain('11:30');
    expect(labels).not.toContain('11:45');
    expect(labels.some((l) => l >= '12:00' && l < '14:00')).toBe(false);
    expect(labels).toContain('17:30');
    expect(labels).not.toContain('17:45');
    // 09:00 em São Paulo é 12:00 UTC: o rótulo é o horário local da empresa, não do aparelho.
    expect(slots[0].startAt).toBe(at(9).toISOString());
    expect(at(9).getUTCHours()).toBe(12);

    // Madrugada aparece quando é expediente de verdade.
    const tuesday = await listAvailableSlots({
      companyId: fixture.company.id,
      timezone: tz,
      serviceId: fixture.service.id,
      date: addDays(monday, 1),
    });
    expect(tuesday[0]?.label).toBe('02:00');
  });

  it('oferece horários no intervalo configurado pela empresa', async () => {
    const labels = async () =>
      (
        await listAvailableSlots({
          companyId: fixture.company.id,
          timezone: tz,
          serviceId: fixture.service.id,
          date: monday,
        })
      ).map((s) => s.label);
    const setStep = (bookingSlotStep: number) =>
      prisma.company.update({ where: { id: fixture.company.id }, data: { bookingSlotStep } });

    // Padrão: 15 em 15 (expediente 09h–12h e 14h–18h, serviço de 30 min).
    expect((await labels()).slice(0, 3)).toEqual(['09:00', '09:15', '09:30']);

    await setStep(30);
    expect(await labels()).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '14:00',
      '14:30',
      '15:00',
      '15:30',
      '16:00',
      '16:30',
      '17:00',
      '17:30',
    ]);

    await setStep(60);
    expect(await labels()).toEqual(['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00']);

    // Pela duração: serviço de 45 min → 09:00, 09:45, 10:30, 11:15 (termina 12:00).
    await setStep(0);
    await prisma.service.update({
      where: { id: fixture.service.id },
      data: { durationMinutes: 45 },
    });
    expect((await labels()).slice(0, 4)).toEqual(['09:00', '09:45', '10:30', '11:15']);
    expect(await labels()).not.toContain('12:00');
  });

  it('repetir o mesmo pedido (duplo clique, nova tentativa) devolve a mesma reserva', async () => {
    const first = await book(at(10));
    const again = await book(at(10));
    expect(again.id).toBe(first.id);
    expect(await prisma.appointment.count({ where: { companyId: fixture.company.id } })).toBe(1);
  });

  it('conflito com outra pessoa vira SlotUnavailableError, sem gravar nada', async () => {
    await book(at(10), '(11) 91111-1111', 'Primeira');
    await expect(book(at(10), '(11) 92222-2222', 'Segunda')).rejects.toBeInstanceOf(
      SlotUnavailableError,
    );
    // Horário fora do expediente também.
    await expect(book(at(13), '(11) 92222-2222')).rejects.toBeInstanceOf(SlotUnavailableError);
    expect(await prisma.appointment.count({ where: { companyId: fixture.company.id } })).toBe(1);
    expect(
      await prisma.client.count({ where: { companyId: fixture.company.id, name: 'Segunda' } }),
    ).toBe(0);
  });

  it('valida nome e WhatsApp no servidor', async () => {
    await expect(book(at(10), '(11) 97777-6666', ' ')).rejects.toThrow('Informe seu nome.');
    await expect(book(at(10), '98888-7777')).rejects.toThrow('com DDD');
    await expect(book(at(10), '+351912345678')).resolves.toBeTruthy();
  });

  it('cliente que já existe mantém o nome cadastrado', async () => {
    await prisma.client.update({
      where: { id: fixture.client.id },
      data: { phone: '11955554444', name: 'Nome Do Cadastro' },
    });
    const appointment = await book(at(15), '(11) 95555-4444', 'Outro Nome Digitado');
    expect(appointment.clientId).toBe(fixture.client.id);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: fixture.client.id } });
    expect(client.name).toBe('Nome Do Cadastro');
  });

  it('antecedência mínima escolhida pela empresa vale para listar e para reservar', async () => {
    // Expediente o dia todo, todos os dias, para o resultado não depender do relógio do teste.
    await prisma.professionalAvailability.deleteMany({
      where: { professionalId: fixture.professional.id },
    });
    await prisma.professionalAvailability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: '00:00',
        endTime: '23:59',
        professionalId: fixture.professional.id,
      })),
    });
    const setLead = (bookingLeadMinutes: number) =>
      prisma.company.update({ where: { id: fixture.company.id }, data: { bookingLeadMinutes } });
    const firstSlot = async () => {
      const range = await listAvailabilityRange({
        companyId: fixture.company.id,
        timezone: tz,
        serviceId: fixture.service.id,
        from: getTodayInTz(tz),
        days: 4,
      });
      const all = [...range.values()].flat().map((x) => new Date(x.startAt).getTime());
      return Math.min(...all);
    };
    const hour = 3_600_000;

    // Padrão de 1 hora (empresas que já existiam não mudam).
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: fixture.company.id } }))
        .bookingLeadMinutes,
    ).toBe(60);
    let first = await firstSlot();
    expect(first).toBeGreaterThanOrEqual(Date.now() + hour - 1000);
    expect(first).toBeLessThan(Date.now() + 2 * hour);

    await setLead(0);
    first = await firstSlot();
    expect(first).toBeLessThan(Date.now() + hour);

    await setLead(1440);
    first = await firstSlot();
    expect(first).toBeGreaterThanOrEqual(Date.now() + 24 * hour - 1000);
    expect(first).toBeLessThan(Date.now() + 25 * hour + 1000);

    // O servidor recusa reserva dentro da antecedência, mesmo que o pedido venha do navegador.
    await expect(book(new Date(Date.now() + 2 * hour))).rejects.toBeInstanceOf(
      SlotUnavailableError,
    );
    // Valor fora das opções cai no padrão em vez de abrir a agenda.
    await setLead(7);
    first = await firstSlot();
    expect(first).toBeGreaterThanOrEqual(Date.now() + hour - 1000);
  });
});
