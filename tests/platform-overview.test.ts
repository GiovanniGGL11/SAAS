import { afterEach, describe, expect, it } from 'vitest';

import { isPlatformAdmin, situationOf, summarizeCompanies } from '@/server/platform/overview';

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
      paying: 1,
      past_due: 1,
      canceled: 1,
      trial: 2,
      trial_pending: 1,
      trial_ended: 1,
    });
    // Profissional 74,90 + Básico 39,90 (cancelada não conta).
    expect(s.mrr).toBe(114.8);
    expect(s.endingSoon.map((c) => c.id)).toEqual(['teste']);
    expect([s.newLast7, s.newLast30]).toEqual([1, 1]);
  });
});
