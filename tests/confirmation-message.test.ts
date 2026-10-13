import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import { createAppointment } from '@/server/data/appointments';
import { buildConfirmationMessage } from '@/server/confirmation-message';
import { verifyAppointmentToken } from '@/server/data/public-booking';
import { createTestCompany, deleteTestCompany } from './helpers';

type Fixture = Awaited<ReturnType<typeof createTestCompany>>;

describe('mensagem de confirmação pelo WhatsApp', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.exemplo.com';
    fixture = await createTestCompany('confirmacao');
  });

  afterEach(async () => {
    await deleteTestCompany(fixture.company.id);
  });

  const book = () =>
    createAppointment({
      companyId: fixture.company.id,
      clientId: fixture.client.id,
      professionalId: fixture.professional.id,
      serviceId: fixture.service.id,
      startAt: new Date('2030-07-01T13:00:00Z'), // 10:00 em Brasília
      createdByUserId: 'user_test',
    });

  it('monta o texto com serviço, horário e o link que o cliente usa para confirmar', async () => {
    await prisma.client.update({
      where: { id: fixture.client.id },
      data: { phone: '11988887777' },
    });
    const appointment = await book();

    const result = await buildConfirmationMessage(fixture.company.id, appointment.id);
    expect(result).not.toBeNull();
    expect(result!.message).toContain('Olá, Client!');
    expect(result!.message).toContain(fixture.company.name);
    expect(result!.message).toContain(fixture.service.name);
    expect(result!.message).toContain('às 10:00');

    // O link da mensagem é o assinado do próprio agendamento.
    const token = result!.url.replace('https://app.exemplo.com/confirmar/', '');
    expect(verifyAppointmentToken(token)).toBe(appointment.id);
    expect(result!.message).toContain(result!.url);

    // E o WhatsApp abre no número do cliente (DDI 55) com a mensagem pronta.
    expect(result!.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/);
    expect(decodeURIComponent(result!.whatsappUrl!.split('?text=')[1])).toBe(result!.message);
  });

  it('sem celular cadastrado devolve a mensagem, mas sem link do WhatsApp', async () => {
    await prisma.client.update({ where: { id: fixture.client.id }, data: { phone: null } });
    const appointment = await book();

    const result = await buildConfirmationMessage(fixture.company.id, appointment.id);
    expect(result!.message).toContain(result!.url);
    expect(result!.whatsappUrl).toBeNull();
  });

  it('não monta mensagem de agendamento de outra empresa', async () => {
    const appointment = await book();
    // O filtro é pelo companyId da sessão: um id de outra empresa nunca acha o agendamento.
    expect(await buildConfirmationMessage('empresa-de-outra-pessoa', appointment.id)).toBeNull();
  });
});
