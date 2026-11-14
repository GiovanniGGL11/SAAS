import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import { ANNUAL_DISCOUNT, chargeCents, getPlan } from '@/lib/billing/plans';
import { handleBillingWebhook, startSubscription } from '@/server/billing/subscription';
import { officialAllowance, runDailyWhatsapp, sendOnce } from '@/server/whatsapp/automation';
import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
import { createTestCompany, deleteTestCompany } from './helpers';

const TZ = 'America/Sao_Paulo';
const day = 86_400_000;

describe('plano anual', () => {
  it('12 mensalidades com o desconto, cobradas de uma vez', () => {
    expect(ANNUAL_DISCOUNT).toBe(0.2);
    expect(chargeCents(getPlan('profissional')!, 0, 'YEARLY')).toBe(76704); // 79,90 × 12 × 0,8
    expect(chargeCents(getPlan('profissional')!, 0, 'MONTHLY')).toBe(7990);
    // Pro com 12 profissionais: os 2 extras também entram no anual.
    expect(chargeCents(getPlan('pro')!, 12, 'YEARLY')).toBe(Math.round(16990 * 12 * 0.8));
  });

  describe('assinatura na Asaas', () => {
    let f: Awaited<ReturnType<typeof createTestCompany>>;
    const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];

    beforeEach(async () => {
      f = await createTestCompany('annual');
      process.env.ASAAS_API_KEY = '$aact_hmlg_teste';
      calls.length = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
          calls.push({
            url,
            method: init.method ?? 'GET',
            body: init.body ? JSON.parse(String(init.body)) : {},
          });
          if (url.endsWith('/customers')) return Response.json({ id: 'cus_anual' });
          if (url.endsWith('/subscriptions'))
            return Response.json({ id: `sub_anual_${f.company.id}`, status: 'ACTIVE' });
          if (url.includes('/payments')) return Response.json({ data: [] });
          return Response.json({});
        }),
      );
    });
    afterEach(async () => {
      vi.unstubAllGlobals();
      delete process.env.ASAAS_API_KEY;
      await prisma.billingWebhookEvent.deleteMany({
        where: { subscriptionId: `sub_anual_${f.company.id}` },
      });
      await deleteTestCompany(f.company.id);
    });

    it('cria a assinatura anual e o pagamento vale 1 ano', async () => {
      const company = await prisma.company.findUniqueOrThrow({ where: { id: f.company.id } });
      await startSubscription(company, {
        planId: 'profissional',
        name: 'Studio Teste',
        cpfCnpj: '529.982.247-25',
        email: 'dono@exemplo.com',
        cycle: 'YEARLY',
      });
      const sub = calls.find((c) => c.url.endsWith('/subscriptions'))!;
      expect(sub.body).toMatchObject({
        cycle: 'YEARLY',
        value: 767.04,
        description: 'Atendafy — plano Profissional anual',
      });
      const saved = await prisma.company.findUniqueOrThrow({ where: { id: f.company.id } });
      expect(saved.billingCycle).toBe('YEARLY');

      await handleBillingWebhook({
        event: 'PAYMENT_CONFIRMED',
        payment: { subscription: `sub_anual_${f.company.id}`, dueDate: '2030-01-10' },
      });
      const paid = await prisma.company.findUniqueOrThrow({ where: { id: f.company.id } });
      expect(paid.subscriptionStatus).toBe('ACTIVE');
      expect(paid.currentPeriodEnd!.toISOString().slice(0, 10)).toBe('2031-01-10');
    });
  });
});

describe('confirmação e lembrete pelo WhatsApp oficial (incluídos no plano)', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  const sent: { url: string; body: Record<string, unknown> }[] = [];

  beforeEach(async () => {
    f = await createTestCompany('official_wa');
    process.env.WHATSAPP_CLOUD_TOKEN = 'token-teste';
    process.env.WHATSAPP_CLOUD_PHONE_ID = '123456';
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        plan: 'profissional',
        subscriptionStatus: 'ACTIVE',
        trialEndsAt: new Date(Date.now() - day),
        currentPeriodEnd: new Date(Date.now() + 20 * day),
        waAutoReminder: true,
      },
    });
    await prisma.client.update({ where: { id: f.client.id }, data: { phone: '11988887777' } });
    sent.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        sent.push({ url, body: JSON.parse(String(init.body ?? '{}')) });
        return Response.json({ messages: [{ id: `wamid.${sent.length}` }] });
      }),
    );
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_CLOUD_TOKEN;
    delete process.env.WHATSAPP_CLOUD_PHONE_ID;
    await deleteTestCompany(f.company.id);
  });

  it('sem a Z-API do salão, sai pelo modelo oficial com os campos certos', async () => {
    expect(await officialAllowance(f.company.id)).toMatchObject({
      ready: true,
      included: 400,
      used: 0,
    });
    const outcome = await sendOnce({
      companyId: f.company.id,
      kind: 'CONFIRMATION',
      dedupeKey: 'confirm:teste',
      phone: '11988887777',
      text: 'texto de registro',
      official: {
        template: 'confirmation',
        values: ['Ana', 'Studio', 'sexta às 10:00', 'https://x'],
      },
    });
    expect(outcome).toBe('sent');
    expect(sent[0].url).toBe('https://graph.facebook.com/v21.0/123456/messages');
    expect(sent[0].body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '5511988887777',
      type: 'template',
      template: { name: 'atendafy_confirmacao', language: { code: 'pt_BR' } },
    });
    const row = await prisma.whatsappMessage.findFirstOrThrow({
      where: { companyId: f.company.id },
    });
    expect([row.channel, row.status]).toEqual(['official', 'SENT']);
  });

  it('o lembrete da véspera usa o oficial; acabou o limite do mês, não envia', async () => {
    const tomorrow = addDays(getTodayInTz(TZ), 1);
    await prisma.appointment.create({
      data: {
        companyId: f.company.id,
        clientId: f.client.id,
        professionalId: f.professional.id,
        serviceId: f.service.id,
        startAt: calendarDateToUtc(tomorrow, 10 * 60, TZ),
        endAt: calendarDateToUtc(tomorrow, 11 * 60, TZ),
        status: 'SCHEDULED',
        priceSnapshot: 50,
        serviceNameSnapshot: 'Corte',
        durationMinutesSnapshot: 60,
        createdByUserId: 'u',
      },
    });
    const result = await runDailyWhatsapp('https://atendafy.test', new Date(), f.company.id);
    expect(result.reminders).toBe(1);
    expect(sent[0].body).toMatchObject({ template: { name: 'atendafy_lembrete' } });

    // Básico não inclui: nada sai pelo oficial.
    await prisma.company.update({ where: { id: f.company.id }, data: { plan: 'essencial' } });
    expect(
      await sendOnce({
        companyId: f.company.id,
        kind: 'CONFIRMATION',
        dedupeKey: 'confirm:basico',
        phone: '11988887777',
        text: 'x',
        official: { template: 'confirmation', values: ['a', 'b', 'c', 'd'] },
      }),
    ).toBe('skipped');
  });

  it('sem o WhatsApp oficial configurado, nada é incluído', async () => {
    delete process.env.WHATSAPP_CLOUD_TOKEN;
    expect(await officialAllowance(f.company.id)).toMatchObject({ ready: false, included: 0 });
  });
});
