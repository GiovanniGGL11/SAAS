import { afterEach, describe, expect, it } from 'vitest';

import { buildUpgradeOffer, pricePerDay } from '@/lib/billing/upgrade';
import { getPlan } from '@/lib/billing/plans';
import { hasFeature, upgradeOffer } from '@/server/billing/features';

const NOW = Date.now();
const active = (plan: string) => ({
  plan,
  subscriptionStatus: 'ACTIVE' as const,
  trialEndsAt: new Date(NOW - 86_400_000),
  currentPeriodEnd: new Date(NOW + 20 * 86_400_000),
});

describe('convite para subir de plano', () => {
  afterEach(() => {
    delete process.env.BILLING_ENFORCE;
  });

  it('Básico vê o Profissional com quanto custa a mais por dia', () => {
    const offer = buildUpgradeOffer('commissions', 'essencial')!;
    expect(offer).toMatchObject({
      planId: 'profissional',
      perDayIsExtra: true,
      title: 'Comissões',
    });
    // (79,90 − 39,90) / 30
    expect(offer.perDay).toBeCloseTo(1.33, 2);
    // Várias unidades é só do Pro.
    expect(buildUpgradeOffer('multiUnit', 'profissional')).toMatchObject({ planId: 'pro' });
  });

  it('o plano que já inclui não recebe convite', () => {
    expect(upgradeOffer(active('profissional'), 'campaigns')).toBeNull();
    expect(upgradeOffer(active('essencial'), 'campaigns')).not.toBeNull();
    expect(hasFeature(active('essencial'), 'reports')).toBe(false);
    expect(hasFeature(active('pro'), 'multiUnit')).toBe(true);
  });

  it('limites de profissionais: Básico 1, Profissional 4, Pro sem limite; preço por dia', () => {
    expect(getPlan('essencial')!.maxProfessionals).toBe(1);
    expect(getPlan('profissional')!.maxProfessionals).toBe(4);
    expect(getPlan('pro')!.maxProfessionals).toBeNull();
    expect(pricePerDay(7990)).toBeCloseTo(2.66, 2);
  });
});
