import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { sealSecret } from '@/server/secret-box';
import { runDailyWhatsapp } from '@/server/whatsapp/automation';
import {
  RETURN_SNOOZE_HOURS,
  listPendingReturns,
  listUpcomingReturns,
  markReturnContact,
} from '@/server/data/returns';
import { listNotices } from '@/server/data/notifications';
import { createTestCompany, deleteTestCompany } from './helpers';

const DAY = 86_400_000;

/**
 * Retorno do paciente: limpeza de pele com retorno sugerido em 21 dias. Dados fictícios; o
 * WhatsApp do salão é simulado (nada sai de verdade).
 */
describe('retorno do paciente', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  let lastVisitAt: Date;
  const sent: { url: string; body: unknown }[] = [];

  /** Atendimento concluído há `daysAgo` dias (sem passar pela comanda). */
  async function doneVisit(daysAgo: number) {
    const startAt = new Date(Date.now() - daysAgo * DAY);
    await prisma.appointment.create({
      data: {
        companyId: f.company.id,
        clientId: f.client.id,
        professionalId: f.professional.id,
        serviceId: f.service.id,
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status: 'DONE',
        serviceNameSnapshot: 'Limpeza de pele',
        durationMinutesSnapshot: 30,
        priceSnapshot: 100,
        createdByUserId: 'u',
      },
    });
    return startAt;
  }

  beforeEach(async () => {
    f = await createTestCompany('retorno');
    await prisma.service.update({
      where: { id: f.service.id },
      data: { name: 'Limpeza de pele', returnAfterDays: 21 },
    });
    await prisma.client.update({
      where: { id: f.client.id },
      data: { name: 'Maria Teste', phone: '11988887777' },
    });
    sent.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        sent.push({ url, body: JSON.parse(String(init.body ?? '{}')) });
        return new Response(JSON.stringify({ messageId: `msg-${sent.length}` }), { status: 200 });
      }),
    );
  }, 60_000);
  afterEach(async () => {
    vi.unstubAllGlobals();
    await deleteTestCompany(f.company.id);
  });

  it('chegando: aparece no sino como "chegando", ainda não pede para enviar', async () => {
    await doneVisit(19); // retorno em 2 dias
    expect(await listPendingReturns(f.company.id)).toHaveLength(0);
    expect(await listUpcomingReturns(f.company.id)).toHaveLength(1);
    const notices = await listNotices(f.company.id, f.company.timezone, new Date(), {
      userId: 'u',
      isAdmin: true,
    });
    expect(notices.map((n) => n.kind)).toContain('returns_soon');
    expect(notices.map((n) => n.kind)).not.toContain('returns_due');
  });

  it('chegou o dia: pede para enviar com a mensagem pronta; "lembrar amanhã" some por 24 h', async () => {
    lastVisitAt = await doneVisit(22);
    const [pending] = await listPendingReturns(f.company.id);
    expect(pending.name).toBe('Maria Teste');
    expect(pending.message).toContain('Limpeza de pele');
    const notices = await listNotices(f.company.id, f.company.timezone, new Date(), {
      userId: 'u',
      isAdmin: true,
    });
    expect(notices.find((n) => n.kind === 'returns_due')?.href).toBe('/atividades?retornos=abrir');
    // A profissional com login próprio não recebe o aviso.
    const forPro = await listNotices(f.company.id, f.company.timezone, new Date(), {
      userId: 'p',
      isAdmin: false,
      isProfessional: true,
    });
    expect(forPro.some((n) => n.kind === 'returns_due')).toBe(false);

    const base = {
      companyId: f.company.id,
      clientId: f.client.id,
      serviceId: f.service.id,
      lastVisitAt: pending.lastVisitAt,
      userId: 'u',
    };
    await markReturnContact({ ...base, status: 'SNOOZED' });
    expect(await listPendingReturns(f.company.id)).toHaveLength(0);
    const later = new Date(Date.now() + (RETURN_SNOOZE_HOURS + 1) * 3_600_000);
    expect(await listPendingReturns(f.company.id, later)).toHaveLength(1);

    await markReturnContact({ ...base, status: 'SENT' });
    expect(await listPendingReturns(f.company.id, later)).toHaveLength(0);
    expect(lastVisitAt).toBeTruthy();
  });

  it('com o automático ligado: envia uma vez só pelo número do salão e respeita quem saiu das promoções', async () => {
    await doneVisit(22);
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        zapiInstanceId: 'INSTANCIA123456',
        zapiToken: sealSecret('TOKEN-SECRETO'),
        waAutoReturn: true,
      },
    });
    const first = await runDailyWhatsapp('https://app.test', new Date(), f.company.id);
    const again = await runDailyWhatsapp('https://app.test', new Date(), f.company.id);
    expect(first.returns).toBe(1);
    expect(again.returns).toBe(0);
    const rows = await prisma.whatsappMessage.findMany({
      where: { companyId: f.company.id, kind: 'RETURN' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toContain('Limpeza de pele');
    // Tratado: não pergunta na tela nem avisa no sino.
    expect(await listPendingReturns(f.company.id)).toHaveLength(0);
    const contact = await prisma.returnContact.findFirstOrThrow({
      where: { companyId: f.company.id },
    });
    expect(contact).toMatchObject({ status: 'SENT', channel: 'auto' });
  });

  it('quem não quer promoções não recebe o automático (e continua na lista para decidir)', async () => {
    await doneVisit(22);
    await prisma.client.update({
      where: { id: f.client.id },
      data: { marketingOptOutAt: new Date(), marketingOptOutBy: 'client' },
    });
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        zapiInstanceId: 'INSTANCIA123456',
        zapiToken: sealSecret('TOKEN-SECRETO'),
        waAutoReturn: true,
      },
    });
    const result = await runDailyWhatsapp('https://app.test', new Date(), f.company.id);
    expect(result.returns).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('quem já tem horário marcado não entra (já está voltando)', async () => {
    await doneVisit(22);
    const future = new Date(Date.now() + 2 * DAY);
    await prisma.appointment.create({
      data: {
        companyId: f.company.id,
        clientId: f.client.id,
        professionalId: f.professional.id,
        serviceId: f.service.id,
        startAt: future,
        endAt: new Date(future.getTime() + 30 * 60_000),
        status: 'SCHEDULED',
        serviceNameSnapshot: 'Limpeza de pele',
        durationMinutesSnapshot: 30,
        priceSnapshot: 100,
        createdByUserId: 'u',
      },
    });
    expect(await listPendingReturns(f.company.id)).toHaveLength(0);
  });
});
