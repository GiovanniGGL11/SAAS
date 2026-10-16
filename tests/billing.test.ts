import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/db';
import {
  getSubscriptionState,
  handleBillingWebhook,
  startSubscription,
} from '@/server/billing/subscription';
import { asaasBaseUrl } from '@/server/billing/asaas';
import { createTestCompany, deleteTestCompany } from './helpers';

const day = 86_400_000;

describe('assinatura do Atendafy (Asaas)', () => {
  let fixture: Awaited<ReturnType<typeof createTestCompany>>;
  const calls: { url: string; method: string; body: unknown; key: string }[] = [];

  beforeEach(async () => {
    fixture = await createTestCompany('billing');
    process.env.ASAAS_API_KEY = '$aact_hmlg_chave_de_teste';
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const headers = init.headers as Record<string, string>;
        calls.push({
          url,
          method: init.method ?? 'GET',
          body: init.body ? JSON.parse(String(init.body)) : null,
          key: headers.access_token,
        });
        if (url.endsWith('/customers')) return Response.json({ id: 'cus_1' });
        if (url.endsWith('/subscriptions'))
          return Response.json({ id: `sub_${fixture.company.id}`, status: 'ACTIVE' });
        if (url.includes('/payments'))
          return Response.json({
            data: [
              {
                id: 'pay_1',
                status: 'PENDING',
                invoiceUrl: 'https://asaas/i/1',
                dueDate: '2030-01-01',
                value: 149.9,
              },
            ],
          });
        return Response.json({});
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    delete process.env.ASAAS_API_KEY;
    delete process.env.BILLING_ENFORCE;
    await deleteTestCompany(fixture.company.id);
  });

  it('chave de sandbox vai para o ambiente de testes', () => {
    expect(asaasBaseUrl('$aact_hmlg_x')).toBe('https://api-sandbox.asaas.com/v3');
    expect(asaasBaseUrl('$aact_prod_x')).toBe('https://api.asaas.com/v3');
  });

  it('teste grátis, bloqueio só com BILLING_ENFORCE e tolerância de atraso', () => {
    const now = new Date('2030-06-15T12:00:00Z');
    const base = { subscriptionStatus: 'TRIAL' as const, plan: null, currentPeriodEnd: null };
    expect(
      getSubscriptionState({ ...base, trialEndsAt: new Date(now.getTime() + 3 * day) }, now)
        .trialDaysLeft,
    ).toBe(3);
    const expired = { ...base, trialEndsAt: new Date(now.getTime() - day) };
    expect(getSubscriptionState(expired, now).blocked).toBe(false); // bloqueio desligado
    process.env.BILLING_ENFORCE = 'true';
    expect(getSubscriptionState(expired, now).blocked).toBe(true);
    // Atrasou há 3 dias: ainda dentro da tolerância de 7.
    const late = {
      subscriptionStatus: 'PAST_DUE' as const,
      plan: 'essencial',
      trialEndsAt: expired.trialEndsAt,
      currentPeriodEnd: new Date(now.getTime() - 3 * day),
    };
    expect(getSubscriptionState(late, now).blocked).toBe(false);
    expect(
      getSubscriptionState({ ...late, currentPeriodEnd: new Date(now.getTime() - 10 * day) }, now)
        .blocked,
    ).toBe(true);
  });

  it('assina, cobra o valor do plano e o webhook ativa e marca atraso', async () => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: fixture.company.id } });
    const result = await startSubscription(company, {
      planId: 'profissional',
      name: 'Studio X',
      cpfCnpj: '123.456.789-09',
      email: 'dono@studio.com',
    });
    expect(result.invoiceUrl).toBe('https://asaas/i/1');
    const sub = calls.find((c) => c.url.endsWith('/subscriptions'))!;
    expect(sub.url.startsWith('https://api-sandbox.asaas.com/v3')).toBe(true);
    expect(sub.key).toBe('$aact_hmlg_chave_de_teste');
    expect(sub.body).toMatchObject({
      customer: 'cus_1',
      value: 149.9,
      cycle: 'MONTHLY',
      billingType: 'UNDEFINED',
      externalReference: company.id,
    });
    expect(
      (calls.find((c) => c.url.endsWith('/customers'))!.body as { cpfCnpj: string }).cpfCnpj,
    ).toBe('12345678909');

    const subscriptionId = `sub_${company.id}`;
    expect(
      await handleBillingWebhook({
        event: 'PAYMENT_CONFIRMED',
        payment: { subscription: subscriptionId, dueDate: '2030-01-10' },
      }),
    ).toBe('updated');
    let after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(after.subscriptionStatus).toBe('ACTIVE');
    expect(after.plan).toBe('profissional');
    expect(after.currentPeriodEnd!.toISOString().slice(0, 10)).toBe('2030-02-10');

    await handleBillingWebhook({
      event: 'PAYMENT_OVERDUE',
      payment: { subscription: subscriptionId },
    });
    after = await prisma.company.findUniqueOrThrow({ where: { id: company.id } });
    expect(after.subscriptionStatus).toBe('PAST_DUE');
    expect(
      await handleBillingWebhook({
        event: 'PAYMENT_CONFIRMED',
        payment: { subscription: 'sub_outra' },
      }),
    ).toBe('ignored');
  });
});
