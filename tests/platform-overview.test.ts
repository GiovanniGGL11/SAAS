import { afterEach, describe, expect, it } from 'vitest';

import { resolveEntitlements } from '@/lib/billing/entitlements';
import { getSubscriptionState } from '@/server/billing/subscription';
import {
  billingByCustomer,
  isPlatformAdmin,
  situationOf,
  summarizeCompanies,
} from '@/server/platform/overview';

const now = new Date('2030-06-15T12:00:00Z');
const day = 86_400_000;
const base = {
  name: 'Empresa',
  plan: null as string | null,
  trialPending: false,
  trialEndsAt: null as Date | null,
  currentPeriodEnd: null as Date | null,
};
const company = (id: string, extra: Partial<typeof base> & Record<string, unknown>) => ({
  ...base,
  id,
  createdAt: new Date(now.getTime() - 40 * day),
  subscriptionStatus: 'TRIAL' as 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED',
  ...extra,
});

describe('painel da plataforma', () => {
  afterEach(() => {
    delete process.env.PLATFORM_ADMIN_USER_IDS;
  });

  it('só abre para quem está na lista (sem lista, para ninguém)', () => {
    expect(isPlatformAdmin('user_a')).toBe(false);
    process.env.PLATFORM_ADMIN_USER_IDS = ' user_a , user_b ';
    expect(isPlatformAdmin('user_a')).toBe(true);
    expect(isPlatformAdmin('user_b')).toBe(true);
    expect(isPlatformAdmin('user_c')).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
  });

  it('separa as empresas por situação, soma a receita recorrente e lista testes acabando', () => {
    const companies = [
      company('pagando', { subscriptionStatus: 'ACTIVE', plan: 'profissional' }),
      company('atrasada', { subscriptionStatus: 'PAST_DUE', plan: 'essencial' }),
      company('cancelada', { subscriptionStatus: 'CANCELED', plan: 'pro' }),
      company('teste', { trialEndsAt: new Date(now.getTime() + 3 * day) }),
      company('teste-longo', { trialEndsAt: new Date(now.getTime() + 20 * day) }),
      company('a-liberar', {
        trialPending: true,
        trialEndsAt: now,
        createdAt: new Date(now.getTime() - 2 * day),
      }),
      company('acabou', { trialEndsAt: new Date(now.getTime() - day) }),
    ];
    expect(situationOf(companies[5], now)).toBe('trial_pending');
    const s = summarizeCompanies(companies, now);
    expect(s.counts).toEqual({
      courtesy: 0,
      paying: 1,
      past_due: 1,
      canceled: 1,
      trial: 2,
      trial_pending: 1,
      trial_ended: 1,
    });
    // Profissional 79,90 + Básico 39,90 (cancelada não conta).
    expect(s.mrr).toBe(119.8);
    expect(s.endingSoon.map((c) => c.id)).toEqual(['teste']);
    expect([s.newLast7, s.newLast30]).toEqual([1, 1]);
  });

  it('cortesia libera o plano dado sem pagar, até a data; depois volta ao normal', () => {
    const until = new Date(now.getTime() + 10 * day);
    const comp = company('cortesia', {
      trialEndsAt: new Date(now.getTime() - day),
      courtesyUntil: until,
      courtesyPlan: 'pro',
    }) as ReturnType<typeof company> & { courtesyUntil: Date; courtesyPlan: string };
    expect(situationOf(comp, now)).toBe('courtesy');
    const ent = resolveEntitlements(comp, { now, production: true });
    expect([ent.source, ent.planId]).toEqual(['subscription', 'pro']);
    process.env.BILLING_ENFORCE = 'true';
    process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'teste';
    expect(getSubscriptionState(comp, now).blocked).toBe(false);
    expect(getSubscriptionState(comp, now).courtesyUntil).toEqual(until);
    const later = new Date(until.getTime() + day);
    expect(getSubscriptionState(comp, later).blocked).toBe(true);
    expect(resolveEntitlements(comp, { now: later, production: true }).source).toBe('none');
    delete process.env.BILLING_ENFORCE;
    // Cortesia não entra na receita recorrente.
    expect(summarizeCompanies([comp], now).mrr).toBe(0);
  });

  it('faturamento por empresa: pago, em aberto, atrasado e próximo vencimento', () => {
    const map = billingByCustomer([
      {
        customer: 'c1',
        value: 39.9,
        netValue: 37.91,
        status: 'RECEIVED',
        dueDate: '2030-04-15',
        paymentDate: '2030-04-14',
      },
      {
        customer: 'c1',
        value: 39.9,
        netValue: 37.91,
        status: 'CONFIRMED',
        dueDate: '2030-05-15',
        paymentDate: '2030-05-15',
      },
      { customer: 'c1', value: 39.9, status: 'PENDING', dueDate: '2030-06-15' },
      { customer: 'c2', value: 74.9, status: 'OVERDUE', dueDate: '2030-05-01' },
      { value: 10, status: 'RECEIVED', dueDate: '2030-05-01' },
    ]);
    expect(map.get('c1')).toEqual({
      paid: 79.8,
      paidNet: 75.82,
      paidCount: 2,
      lastPaidAt: '2030-05-15',
      open: 39.9,
      overdue: 0,
      nextDueDate: '2030-06-15',
    });
    expect(map.get('c2')).toMatchObject({ paid: 0, overdue: 74.9 });
    expect(map.size).toBe(2);
  });
});
