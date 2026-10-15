import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { openSecret, sealSecret } from '@/server/secret-box';
import { toZapiPhone } from '@/server/whatsapp/zapi';
import { runDailyWhatsapp, sendOnce } from '@/server/whatsapp/automation';
import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
import { createTestCompany, deleteTestCompany } from './helpers';

const TZ = 'America/Sao_Paulo';

describe('WhatsApp automático (Z-API)', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  let companyId: string;
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = [];

  beforeEach(async () => {
    fixture = await createTestCompany('zapi');
    companyId = fixture.company.id;
    await prisma.company.update({
      where: { id: companyId },
      data: {
        zapiInstanceId: 'INSTANCIA123456',
        zapiToken: sealSecret('TOKEN-SECRETO'),
        zapiClientToken: sealSecret('CLIENT-TOKEN'),
        waAutoReminder: true,
        waAutoBirthday: true,
      },
    });
    await prisma.client.update({
      where: { id: fixture.client.id },
      data: { phone: '11988887777' },
    });
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url,
          headers: init.headers as Record<string, string>,
          body: JSON.parse(String(init.body ?? '{}')),
        });
        return new Response(JSON.stringify({ messageId: `msg-${calls.length}` }), { status: 200 });
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await deleteTestCompany(companyId);
  });

  it('cifra o token e formata o telefone com DDI', () => {
    const sealed = sealSecret('abc');
    expect(sealed).not.toContain('abc');
    expect(openSecret(sealed)).toBe('abc');
    expect(toZapiPhone('(11) 98888-7777')).toBe('5511988887777');
    expect(toZapiPhone('5511988887777')).toBe('5511988887777');
    expect(toZapiPhone('123')).toBeNull();
  });

  it('envia no formato da Z-API e nunca manda a mesma mensagem duas vezes', async () => {
    const send = () =>
      sendOnce({
        companyId,
        kind: 'TEST',
        dedupeKey: 'teste-1',
        phone: '11988887777',
        text: 'Olá',
      });
    expect(await send()).toBe('sent');
    expect(await send()).toBe('skipped');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://api.z-api.io/instances/INSTANCIA123456/token/TOKEN-SECRETO/send-text',
    );
    expect(calls[0].headers['Client-Token']).toBe('CLIENT-TOKEN');
    expect(calls[0].body).toEqual({ phone: '5511988887777', message: 'Olá' });
    const row = await prisma.whatsappMessage.findFirstOrThrow({ where: { companyId } });
    expect([row.status, row.providerId]).toEqual(['SENT', 'msg-1']);
  });

  it('falha da Z-API fica registrada com o motivo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'instance not connected' }), { status: 400 }),
      ),
    );
    expect(
      await sendOnce({ companyId, kind: 'TEST', dedupeKey: 't2', phone: '11988887777', text: 'x' }),
    ).toBe('failed');
    const row = await prisma.whatsappMessage.findFirstOrThrow({ where: { companyId } });
    expect(row.status).toBe('FAILED');
    expect(row.error).toMatch(/instance not connected/);
  });

  it('rotina diária: lembrete de amanhã e parabéns de hoje, uma vez só', async () => {
    const tomorrow = addDays(getTodayInTz(TZ), 1);
    await prisma.appointment.create({
      data: {
        companyId,
        clientId: fixture.client.id,
        professionalId: fixture.professional.id,
        serviceId: fixture.service.id,
        startAt: calendarDateToUtc(tomorrow, 10 * 60, TZ),
        endAt: calendarDateToUtc(tomorrow, 10 * 60 + 30, TZ),
        priceSnapshot: 50,
        serviceNameSnapshot: 'Corte',
        durationMinutesSnapshot: 30,
        createdByUserId: 'u',
      },
    });
    const today = getTodayInTz(TZ);
    await prisma.client.create({
      data: {
        companyId,
        name: 'Aniversariante',
        phone: '11977776666',
        birthDate: new Date(Date.UTC(1990, today.month - 1, today.day)),
      },
    });
    // Duas execuções do cron (ex.: a Vercel repetindo a chamada): cada mensagem sai uma vez só.
    await runDailyWhatsapp('https://app.test');
    await runDailyWhatsapp('https://app.test');
    const rows = await prisma.whatsappMessage.findMany({
      where: { companyId },
      orderBy: { kind: 'asc' },
    });
    expect(rows.map((r) => [r.kind, r.status])).toEqual([
      ['BIRTHDAY', 'SENT'],
      ['REMINDER', 'SENT'],
    ]);
    expect(rows[1].text).toContain('https://app.test/confirmar/');
  });
});
