import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { describeAudit } from '@/lib/audit-describe';
import { formatCurrencyBRL } from '@/lib/serialize';
import { cancelAppointment, createAppointment, moveAppointment } from '@/server/data/appointments';
import { listAuditHistory } from '@/server/data/audit-history';
import { createTestCompany, deleteTestCompany } from './helpers';

const tz = 'America/Sao_Paulo';

describe('histórico: textos', () => {
  const d = (entityType: string, action: string, metadata: unknown = null) =>
    describeAudit({ entityType, action, userId: 'user_x', metadata }, tz);

  it('agenda: horário, cobrança e cancelamento em português', () => {
    expect(
      d('Appointment', 'moved', {
        fromStartAt: '2030-05-01T13:00:00.000Z',
        startAt: '2030-05-01T17:00:00.000Z',
      }),
    ).toEqual({ title: 'Horário alterado', detail: 'de 01/05 às 10:00 para 01/05 às 14:00' });
    expect(
      d('Appointment', 'status_changed', {
        from: 'CONFIRMED',
        status: 'DONE',
        total: '45',
        tip: 2,
        coupon: 'DEZ',
        paymentMethod: 'PIX',
      }),
    ).toEqual({
      title: 'Concluído e cobrado',
      detail: `Total ${formatCurrencyBRL(45)} · cupom DEZ · gorjeta ${formatCurrencyBRL(2)} · PIX`,
    });
    expect(d('Appointment', 'status_changed', { from: 'SCHEDULED', status: 'CONFIRMED' })).toEqual({
      title: 'Status: Confirmado',
      detail: 'antes: Agendado',
    });
    expect(d('Appointment', 'canceled', { reason: 'cliente remarcou' })).toEqual({
      title: 'Agendamento cancelado',
      detail: 'motivo: cliente remarcou',
    });
    expect(d('Appointment', 'moved', { edited: true, clientId: 'c1' }).title).toBe(
      'Detalhes alterados',
    );
  });

  it('cadastros e quem não é da equipe', () => {
    expect(d('Client', 'updated', { active: false, name: 'Ana' })).toEqual({
      title: 'Cliente arquivado',
      detail: 'Ana',
    });
    expect(d('Client', 'created', { source: 'assistant', name: 'Bia' }).title).toBe(
      'Cliente cadastrado (pelo assistente)',
    );
  });
});

describe('histórico: consulta', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;

  beforeEach(async () => {
    fixture = await createTestCompany('historico');
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  it('mostra o que mudou, quem fez, o horário anterior e não mistura empresas', async () => {
    const appointment = await createAppointment({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: new Date('2030-05-01T13:00:00Z'),
      createdByUserId: 'online-booking',
    });
    await moveAppointment({
      companyId: fixture.company.id,
      id: appointment.id,
      startAt: new Date('2030-05-01T17:00:00Z'),
      updatedByUserId: 'client-portal',
    });
    await cancelAppointment({
      companyId: fixture.company.id,
      id: appointment.id,
      canceledByUserId: 'client-link',
      reason: 'imprevisto',
    });

    const { entries, nextBefore } = await listAuditHistory(fixture.company.id, tz, { days: 1 });
    expect(entries.map((e) => e.title)).toEqual([
      'Agendamento cancelado',
      'Horário alterado',
      'Agendamento criado',
    ]);
    expect(entries.map((e) => e.actor)).toEqual([
      'Cliente (link de confirmação)',
      'Cliente (área do cliente)',
      'Cliente (agendamento online)',
    ]);
    expect(entries[1].detail).toBe('de 01/05 às 10:00 para 01/05 às 14:00');
    expect(entries[0].subject).toContain(fixture.client.name);
    expect(entries[0].href).toBe(`/agenda?data=2030-05-01&agendamento=${appointment.id}`);
    expect(nextBefore).toBeNull();

    // Paginação: 2 por página, a segunda começa depois da primeira.
    const first = await listAuditHistory(fixture.company.id, tz, { days: 1, limit: 2 });
    expect(first.entries).toHaveLength(2);
    expect(first.nextBefore).not.toBeNull();
    const second = await listAuditHistory(fixture.company.id, tz, {
      days: 1,
      limit: 2,
      before: new Date(first.nextBefore!),
    });
    expect(second.entries.map((e) => e.title)).toEqual(['Agendamento criado']);

    // Outra empresa não enxerga nada disso.
    expect((await listAuditHistory('empresa-de-outra-pessoa', tz, { days: 1 })).entries).toEqual(
      [],
    );
    await prisma.auditLog.count({ where: { companyId: fixture.company.id } });
  });
});
