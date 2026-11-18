import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/db';
import {
  FEATURE_TRIAL_DAYS,
  NON_TRIALABLE,
  activeTrialKeys,
  featureTrialStatus,
  newTrial,
  parseFeatureTrials,
} from '@/lib/billing/feature-trials';
import {
  featureAccessFor,
  hasFeature,
  startFeatureTrial,
  trialCatalog,
  upgradeOffer,
} from '@/server/billing/features';
import { AI_DEMO_QUESTIONS, AI_DEMO_SUGGESTIONS } from '@/lib/ai-demo';
import { askAiDemo } from '@/server/ai/demo';
import { buildAiSession } from '@/server/ai/access';
import { createTestCompany, deleteTestCompany } from './helpers';

/** Empresa no Básico com a assinatura em dia (dados fictícios). */
const basico = (featureTrials: unknown = {}) => ({
  plan: 'essencial',
  subscriptionStatus: 'ACTIVE' as const,
  trialEndsAt: null,
  currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
  featureTrials: featureTrials as never,
});

describe('teste grátis de 3 dias por recurso (regras)', () => {
  const now = new Date('2030-05-10T12:00:00Z');

  it('dura 3 dias e vale até o fim', () => {
    const trial = newTrial(now);
    expect(FEATURE_TRIAL_DAYS).toBe(3);
    expect(trial.endsAt).toBe('2030-05-13T12:00:00.000Z');
    const trials = { commissions: trial };
    expect(featureTrialStatus(trials, 'commissions', now).state).toBe('active');
    expect(featureTrialStatus(trials, 'commissions', new Date('2030-05-13T12:00:01Z')).state).toBe(
      'used',
    );
    expect(featureTrialStatus(trials, 'reports', now).state).toBe('available');
  });

  it('mensagens automáticas, rotinas e várias unidades ficam fora do teste', () => {
    for (const key of [
      'whatsappAutomation',
      'campaigns',
      'automationRules',
      'multiUnit',
    ] as const) {
      expect(NON_TRIALABLE.has(key)).toBe(true);
      expect(featureTrialStatus({}, key, now).state).toBe('not_trialable');
    }
    // Mesmo gravado à mão, um recurso fora do teste nunca abre.
    expect(activeTrialKeys({ campaigns: newTrial(now) }, now)).toEqual([]);
  });

  it('ignora JSON com formato errado', () => {
    expect(parseFeatureTrials(null)).toEqual({});
    expect(parseFeatureTrials({ commissions: 'x', reports: { endsAt: 1 } })).toEqual({});
  });

  it('o teste ativo libera o recurso no servidor; depois trava de novo', () => {
    const trial = newTrial(new Date());
    expect(hasFeature(basico(), 'commissions')).toBe(false);
    expect(hasFeature(basico({ commissions: trial }), 'commissions')).toBe(true);
    const access = featureAccessFor(basico({ commissions: trial }));
    expect(access.planFeatures.commissions).toBe(false);
    expect(access.trials.map((t) => t.key)).toEqual(['commissions']);
    const ended = { startedAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-04T00:00:00Z' };
    expect(hasFeature(basico({ commissions: ended }), 'commissions')).toBe(false);
  });

  it('o convite mostra o botão de teste, e depois que acabou, a data', () => {
    expect(upgradeOffer(basico(), 'commissions')?.trial).toMatchObject({
      available: true,
      days: 3,
    });
    const ended = { startedAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-04T00:00:00Z' };
    expect(upgradeOffer(basico({ commissions: ended }), 'commissions')?.trial).toMatchObject({
      available: false,
      endedAt: '2020-01-04T00:00:00Z',
    });
    // Durante o teste, não há convite: o recurso está liberado.
    expect(upgradeOffer(basico({ commissions: newTrial() }), 'commissions')).toBeNull();
    // Recurso sem teste: só o convite para o plano.
    expect(upgradeOffer(basico(), 'campaigns')?.trial ?? null).toBeNull();
  });

  it('a página Assinatura lista só o que está fora do plano e tem teste', () => {
    const keys = trialCatalog(basico()).map((i) => i.key);
    expect(keys).toContain('commissions');
    expect(keys).toContain('pricingCalculator');
    expect(keys).toContain('profitAnalysis');
    expect(keys).not.toContain('campaigns');
    expect(keys).not.toContain('agenda');
  });
});

describe('teste grátis no banco (uma vez por recurso)', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  beforeAll(async () => {
    f = await createTestCompany('feature_trial');
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        plan: 'essencial',
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      },
    });
  });
  afterAll(async () => {
    await deleteTestCompany(f.company.id);
  });

  it('começa, libera, não começa de novo e não abre recurso sem teste', async () => {
    const trial = await startFeatureTrial(f.company.id, 'commissions');
    // Clique duplo: devolve o mesmo teste, não abre outro.
    const again = await startFeatureTrial(f.company.id, 'commissions');
    expect(again.endsAt).toBe(trial.endsAt);
    const company = await prisma.company.findUniqueOrThrow({ where: { id: f.company.id } });
    expect(hasFeature(company, 'commissions')).toBe(true);
    await expect(startFeatureTrial(f.company.id, 'campaigns')).rejects.toThrow('não tem teste');
    await expect(startFeatureTrial(f.company.id, 'agenda')).rejects.toThrow('já inclui');

    // Depois de acabar, não dá para testar de novo.
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        featureTrials: {
          commissions: { startedAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-04T00:00:00Z' },
        },
      },
    });
    await expect(startFeatureTrial(f.company.id, 'commissions')).rejects.toThrow('já testou');
  });
});

describe('demonstração curta da IA (plano sem IA)', () => {
  let f: Awaited<ReturnType<typeof createTestCompany>>;
  const previousKey = process.env.GEMINI_API_KEY;
  beforeAll(async () => {
    f = await createTestCompany('ai_demo');
    await prisma.company.update({
      where: { id: f.company.id },
      data: {
        plan: 'essencial',
        subscriptionStatus: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    process.env.GEMINI_API_KEY = previousKey || 'chave-de-teste';
  });
  afterAll(async () => {
    process.env.GEMINI_API_KEY = previousKey;
    await deleteTestCompany(f.company.id);
  });

  const session = async (isAdmin = true) =>
    buildAiSession({
      company: await prisma.company.findUniqueOrThrow({ where: { id: f.company.id } }),
      userId: 'u',
      isAdmin,
    });
  // Modelo de mentira: nada é enviado a um provedor de verdade.
  const fakeRun = async (params: { mode?: string; maxSteps?: number; messages: unknown[] }) => {
    expect(params.mode).toBe('SUGGEST');
    expect(params.maxSteps).toBe(3);
    expect(params.messages).toHaveLength(1);
    return {
      reply: 'Você faturou R$ 1.234,00 este mês.',
      proposals: [],
      calls: 1,
      usage: { inputTokens: 0, outputTokens: 0 },
    } as never;
  };

  it('tem sugestões diretas e 3 perguntas, uma vez só; só o dono usa', async () => {
    expect(AI_DEMO_SUGGESTIONS).toContain('Quanto faturei este mês?');
    await expect(
      askAiDemo({
        session: await session(false),
        question: 'Quanto faturei?',
        run: fakeRun as never,
      }),
    ).rejects.toThrow('dono ou administrador');
    for (let i = AI_DEMO_QUESTIONS - 1; i >= 0; i--) {
      const r = await askAiDemo({
        session: await session(),
        question: 'Quanto faturei este mês?',
        run: fakeRun as never,
      });
      expect(r.reply).toContain('R$ 1.234,00');
      expect(r.remaining).toBe(i);
    }
    await expect(
      askAiDemo({ session: await session(), question: 'E amanhã?', run: fakeRun as never }),
    ).rejects.toThrow('já usou');
  });

  it('pergunta longa é recusada sem gastar; falha do provedor devolve a pergunta', async () => {
    await prisma.company.update({ where: { id: f.company.id }, data: { aiDemoUsed: 0 } });
    await expect(
      askAiDemo({ session: await session(), question: 'a'.repeat(151), run: fakeRun as never }),
    ).rejects.toThrow('pergunta direta');
    await expect(
      askAiDemo({
        session: await session(),
        question: 'Quanto faturei?',
        run: (async () => {
          throw new Error('caiu');
        }) as never,
      }),
    ).rejects.toThrow('caiu');
    const company = await prisma.company.findUniqueOrThrow({ where: { id: f.company.id } });
    expect(company.aiDemoUsed).toBe(0);
  });
});
