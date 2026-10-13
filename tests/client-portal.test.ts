import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
import { createAppointment } from '@/server/data/appointments';
import {
  cancelOwnAppointment,
  confirmOwnAppointment,
  createPortalToken,
  getCompanyOfStaleToken,
  getPortalOverview,
  getPortalSession,
  listRescheduleSlots,
  readPortalToken,
  rescheduleOwnAppointment,
  signPortalToken,
  type PortalSession,
} from '@/server/data/client-portal';
import { createTestCompany, deleteTestCompany } from './helpers';

type Fixture = Awaited<ReturnType<typeof createTestCompany>>;

const tz = 'America/Sao_Paulo';
// Uma terça daqui a uns dias: dentro dos 21 dias de agenda aberta e longe do aviso mínimo.
const target = (() => {
  let d = addDays(getTodayInTz(tz), 3);
  while (new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() !== 2) d = addDays(d, 1);
  return d;
})();
const at = (hour: number, minute = 0) => calendarDateToUtc(target, hour * 60 + minute, tz);

async function book(fixture: Fixture, startAt: Date, clientId = fixture.client.id) {
  return createAppointment({
    companyId: fixture.company.id,
    clientId,
    professionalId: fixture.professional.id,
    serviceId: fixture.service.id,
    startAt,
    createdByUserId: 'user_test',
  });
}

async function sessionFor(fixture: Fixture): Promise<PortalSession> {
  const { token } = await createPortalToken(fixture.company.id, fixture.client.id);
  const session = await getPortalSession(token);
  expect(session).not.toBeNull();
  return session!;
}

describe('link pessoal da área do cliente', () => {
  it('confere a assinatura e recusa link alterado ou malformado', () => {
    const token = signPortalToken('client_abc', 3);
    expect(readPortalToken(token)).toEqual({ clientId: 'client_abc', version: 3 });

    const [id, , sig] = token.split('.');
    // Trocar a versão (ou o cliente) sem a assinatura certa não passa.
    expect(readPortalToken(`${id}.4.${sig}`)).toBeNull();
    expect(readPortalToken(`client_xyz.3.${sig}`)).toBeNull();
    expect(readPortalToken(`${token}x`)).toBeNull();
    expect(readPortalToken('lixo')).toBeNull();
    expect(readPortalToken(`${token}.extra`)).toBeNull();
  });
});

describe('área do cliente', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createTestCompany('portal');
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  it('gerar um link novo derruba os anteriores, mas ainda diz de qual empresa eram', async () => {
    const first = await createPortalToken(fixture.company.id, fixture.client.id);
    expect((await getPortalSession(first.token))?.id).toBe(fixture.client.id);

    const second = await createPortalToken(fixture.company.id, fixture.client.id, true);
    expect(second.token).not.toBe(first.token);
    expect(await getPortalSession(first.token)).toBeNull();
    expect((await getPortalSession(second.token))?.company.id).toBe(fixture.company.id);
    expect((await getCompanyOfStaleToken(first.token))?.slug).toBe(fixture.company.slug);
  });

  it('cliente desativado ou empresa removida perde o acesso', async () => {
    const { token } = await createPortalToken(fixture.company.id, fixture.client.id);
    await prisma.client.update({ where: { id: fixture.client.id }, data: { active: false } });
    expect(await getPortalSession(token)).toBeNull();

    await prisma.client.update({ where: { id: fixture.client.id }, data: { active: true } });
    await prisma.company.update({
      where: { id: fixture.company.id },
      data: { deletedAt: new Date() },
    });
    expect(await getPortalSession(token)).toBeNull();
  });

  it('a equipe não gera link para cliente de outra empresa', async () => {
    const other = await createTestCompany('portal-other');
    try {
      await expect(createPortalToken(other.company.id, fixture.client.id)).rejects.toThrow(
        'Cliente não encontrado',
      );
      // E pedir rotação com o id errado não mexe no cliente dos outros.
      await expect(createPortalToken(other.company.id, fixture.client.id, true)).rejects.toThrow();
      const client = await prisma.client.findUniqueOrThrow({ where: { id: fixture.client.id } });
      expect(client.portalVersion).toBe(1);
    } finally {
      await deleteTestCompany(other.company.id);
    }
  });

  it('mostra só os horários do próprio cliente e deixa confirmar', async () => {
    const mine = await book(fixture, at(10));
    const someoneElse = await prisma.client.create({
      data: { companyId: fixture.company.id, name: 'Outra Pessoa', phone: '11900000000' },
    });
    const theirs = await book(fixture, at(15), someoneElse.id);

    const session = await sessionFor(fixture);
    const overview = await getPortalOverview(session);
    expect(overview.upcoming.map((a) => a.id)).toEqual([mine.id]);
    expect(overview.upcoming[0].canChange).toBe(true);

    await confirmOwnAppointment(session, mine.id);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe(
      'CONFIRMED',
    );

    // O horário de outra pessoa não existe para esta sessão.
    await expect(cancelOwnAppointment(session, theirs.id)).rejects.toThrow(
      'Agendamento não encontrado',
    );
    await expect(confirmOwnAppointment(session, theirs.id)).rejects.toThrow();
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe(
      'SCHEDULED',
    );
  });

  it('não deixa cancelar nem remarcar em cima da hora', async () => {
    const soon = new Date(Date.now() + 60 * 60_000);
    soon.setUTCSeconds(0, 0);
    const appointment = await book(fixture, soon);
    const session = await sessionFor(fixture);

    const overview = await getPortalOverview(session);
    expect(overview.upcoming[0].canChange).toBe(false);
    await expect(cancelOwnAppointment(session, appointment.id)).rejects.toThrow('menos de 2 horas');
    await expect(listRescheduleSlots(session, appointment.id, target)).rejects.toThrow(
      'menos de 2 horas',
    );
  });

  it('cancela o próprio horário com antecedência', async () => {
    const appointment = await book(fixture, at(10));
    const session = await sessionFor(fixture);
    await cancelOwnAppointment(session, appointment.id);

    const saved = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(saved.status).toBe('CANCELED');
    expect((await getPortalOverview(session)).upcoming).toHaveLength(0);
  });

  it('remarca só para horários livres, contando o próprio horário como livre', async () => {
    const appointment = await book(fixture, at(10));
    const someoneElse = await prisma.client.create({
      data: { companyId: fixture.company.id, name: 'Outra Pessoa', phone: '11900000001' },
    });
    await book(fixture, at(14), someoneElse.id);
    const session = await sessionFor(fixture);

    const slots = await listRescheduleSlots(session, appointment.id, target);
    const labels = slots.map((slot) => slot.label);
    expect(labels).not.toContain('10:00'); // é o horário atual
    expect(labels).toContain('10:15'); // sobrepõe só o próprio agendamento
    expect(labels).not.toContain('14:00'); // ocupado por outra pessoa
    expect(labels).not.toContain('13:45'); // 30 min invadiriam as 14:00

    await expect(rescheduleOwnAppointment(session, appointment.id, at(14))).rejects.toThrow(
      'não está mais disponível',
    );
    // Fora da grade de 15 minutos também não passa, mesmo livre.
    await expect(rescheduleOwnAppointment(session, appointment.id, at(11, 7))).rejects.toThrow(
      'não está mais disponível',
    );

    await rescheduleOwnAppointment(session, appointment.id, at(10, 15));
    const moved = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(moved.startAt.toISOString()).toBe(at(10, 15).toISOString());
    expect(moved.endAt.getTime() - moved.startAt.getTime()).toBe(30 * 60_000);
  });

  it('não lista horários fora do período de agendamento', async () => {
    const appointment = await book(fixture, at(10));
    const session = await sessionFor(fixture);
    await expect(
      listRescheduleSlots(session, appointment.id, addDays(getTodayInTz(tz), 60)),
    ).rejects.toThrow('fora do período');
    await expect(
      listRescheduleSlots(session, appointment.id, addDays(getTodayInTz(tz), -1)),
    ).rejects.toThrow('fora do período');
  });
});
