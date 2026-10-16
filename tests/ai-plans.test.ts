import { describe, expect, it } from 'vitest';

import { PLANS, TRIAL_GRANT, getPlan } from '@/lib/billing/plans';
import {
  AI_BLOCK_MESSAGE,
  effectiveAutonomy,
  resolveEntitlements,
  type Entitlements,
} from '@/lib/billing/entitlements';
import { canAutoExecute, type AutomatableTask } from '@/server/ai/autonomy';

const NOW = new Date('2031-06-15T12:00:00Z');
const DAY = 86_400_000;
const company = (over: Partial<Parameters<typeof resolveEntitlements>[0]> = {}) => ({
  plan: null,
  subscriptionStatus: 'ACTIVE' as const,
  trialEndsAt: new Date(NOW.getTime() - DAY),
  currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY),
  ...over,
});
const resolve = (
  over: Partial<Parameters<typeof resolveEntitlements>[0]> = {},
  production = false,
) => resolveEntitlements(company(over), { now: NOW, production });

describe('configuração central dos planos', () => {
  it('ids estáveis, preços em centavos, três planos oferecidos e Rede preservado como antigo', () => {
    expect(new Set(PLANS.map((p) => p.id)).size).toBe(PLANS.length);
    expect(PLANS.filter((p) => p.offered).map((p) => [p.id, p.name, p.priceCents])).toEqual([
      ['essencial', 'Básico', 7990],
      ['profissional', 'Profissional', 14990],
      ['pro', 'Pro', 29990],
    ]);
    expect(getPlan('rede')).toMatchObject({ legacy: true, offered: false, checkoutEnabled: false });
    // Preço do Pro ainda não publicado: não dá para contratar.
    expect(getPlan('pro')!.checkoutEnabled).toBe(false);
    for (const plan of PLANS) expect(Number.isInteger(plan.priceCents)).toBe(true);
  });

  it('Básico não inclui nenhuma IA nem franquia', () => {
    const basic = getPlan('essencial')!;
    expect(basic.ai).toMatchObject({
      assistant: false,
      voice: false,
      assistedActions: false,
      aiAutomations: false,
      autoExecution: false,
      monthlyUnits: 0,
    });
    expect(basic.addOns).toEqual([]);
  });
});

describe('direitos efetivos', () => {
  it('Básico ativo: IA bloqueada com a mensagem do plano; gestão manual liberada', () => {
    const e = resolve({ plan: 'essencial' });
    expect(e.ai.available.assistant).toBe(false);
    expect(e.ai.reasons.assistant).toBe('not_in_plan');
    expect(AI_BLOCK_MESSAGE.not_in_plan).toBe(
      'O assistente de IA está disponível nos planos Profissional e Pro.',
    );
    expect(e.features.agenda && e.features.finance).toBe(true);
    expect(effectiveAutonomy('AUTO_RULES', e)).toBe('SUGGEST');
  });

  it('Profissional: franquia não definida bloqueia em produção e usa o valor provisório só em desenvolvimento', () => {
    const prod = resolve({ plan: 'profissional' }, true);
    expect(prod.ai.available.assistant).toBe(false);
    expect(prod.ai.reasons.assistant).toBe('quota_not_configured');
    // Executar o que já foi aprovado não consome IA.
    expect(prod.ai.available.assistedActions).toBe(true);

    const dev = resolve({ plan: 'profissional' });
    expect(dev.ai.available.assistant).toBe(true);
    expect(dev.ai.provisionalUnits).toBe(true);
    expect(dev.ai.available.voice).toBe(false);
    expect(dev.ai.reasons.voice).toBe('not_implemented');
    expect(dev.ai.available.autoExecution).toBe(false);
    expect(dev.ai.reasons.autoExecution).toBe('not_in_plan');
  });

  it('Pro: inclui execução automática, mas ela segue indisponível até existir', () => {
    const pro = resolve({ plan: 'pro' });
    expect(pro.ai.included?.autoExecution).toBe(true);
    expect(pro.ai.reasons.autoExecution).toBe('not_implemented');
    expect(effectiveAutonomy('AUTO_RULES', pro)).toBe('APPROVAL');
    expect(effectiveAutonomy('SUGGEST', pro)).toBe('SUGGEST');
  });

  it('teste grátis: concessão explícita do plano base; quem escolheu o Básico fica sem IA', () => {
    const trialing = {
      subscriptionStatus: 'TRIAL' as const,
      trialEndsAt: new Date(NOW.getTime() + 5 * DAY),
      currentPeriodEnd: null,
    };
    const free = resolve(trialing);
    expect(free).toMatchObject({ source: 'trial', planId: TRIAL_GRANT.basePlan });
    expect(free.ai.available.assistant).toBe(true);
    const basicTrial = resolve({ ...trialing, plan: 'essencial' });
    expect(basicTrial.ai.available.assistant).toBe(false);
    // Teste acabou sem assinatura: sem IA.
    const ended = resolve({ ...trialing, trialEndsAt: new Date(NOW.getTime() - DAY) });
    expect(ended.source).toBe('none');
    expect(ended.ai.reasons.assistant).toBe('no_subscription');
  });

  it('atraso: dentro do período pago tudo vale; na tolerância a IA pausa; depois, nada', () => {
    const paid = resolve({ plan: 'profissional', subscriptionStatus: 'PAST_DUE' });
    expect(paid.ai.available.assistant).toBe(true);
    const grace = resolve({
      plan: 'profissional',
      subscriptionStatus: 'PAST_DUE',
      currentPeriodEnd: new Date(NOW.getTime() - 2 * DAY),
    });
    expect(grace.source).toBe('grace');
    expect(grace.ai.reasons.assistant).toBe('past_due');
    expect(grace.features.forms).toBe(true);
    const late = resolve({
      plan: 'profissional',
      subscriptionStatus: 'PAST_DUE',
      currentPeriodEnd: new Date(NOW.getTime() - 30 * DAY),
    });
    expect(late.source).toBe('none');
  });

  it('cancelamento vale até o fim do período pago', () => {
    expect(resolve({ plan: 'profissional', subscriptionStatus: 'CANCELED' }).source).toBe(
      'paid_period',
    );
    expect(
      resolve({
        plan: 'profissional',
        subscriptionStatus: 'CANCELED',
        currentPeriodEnd: new Date(NOW.getTime() - DAY),
      }).source,
    ).toBe('none');
  });

  it('Rede antigo não vira Pro: IA com aprovação, sem execução automática', () => {
    const rede = resolve({ plan: 'rede' });
    expect(rede.planId).toBe('rede');
    expect(rede.ai.available.assistant).toBe(true);
    expect(rede.ai.reasons.autoExecution).toBe('not_in_plan');
    expect(rede.maxProfessionals).toBeNull();
  });

  it('downgrade do Pro para o Profissional e para o Básico: modo automático vira aprovação; Básico só sugere', () => {
    expect(effectiveAutonomy('AUTO_RULES', resolve({ plan: 'profissional' }))).toBe('APPROVAL');
    expect(effectiveAutonomy('APPROVAL', resolve({ plan: 'essencial' }))).toBe('SUGGEST');
  });
});

describe('contrato da execução automática', () => {
  const registry: Record<string, AutomatableTask> = {
    lembrete: { label: 'Lembrete', description: '', category: null, implemented: true },
    massa: { label: 'Campanha', description: '', category: 'mass_message', implemented: true },
    futura: { label: 'Futura', description: '', category: null, implemented: false },
  };
  const proEntitlements = (auto: boolean): Entitlements => {
    const e = resolve({ plan: 'pro' });
    return { ...e, ai: { ...e.ai, available: { ...e.ai.available, autoExecution: auto } } };
  };
  const session = (auto = true, mode: 'AUTO_RULES' | 'APPROVAL' = 'AUTO_RULES') => ({
    companyId: 'c1',
    entitlements: proEntitlements(auto),
    autonomy: { stored: mode, effective: mode },
  });
  const auth = (over = {}) => ({
    companyId: 'c1',
    taskType: 'lembrete',
    status: 'ACTIVE' as const,
    limits: {
      maxPerDay: 2,
      allowedHours: { from: 8, to: 20 },
      maxSpendCents: 500,
      maxAudience: 50,
    },
    createdByUserId: 'user_admin',
    ...over,
  });
  const task = (over = {}) => ({
    type: 'lembrete',
    companyId: 'c1',
    createdAt: new Date(NOW.getTime() - 60_000),
    estimatedSpendCents: 100,
    audienceSize: 10,
    localHour: 10,
    ...over,
  });
  const check = (over: Partial<Parameters<typeof canAutoExecute>[0]> = {}) =>
    canAutoExecute({
      session: session(),
      authorization: auth(),
      task: task(),
      executionsToday: 0,
      now: NOW,
      registry,
      ...over,
    });

  it('executa só com plano, modo, autorização da tarefa e dentro dos limites', () => {
    expect(check()).toEqual({ ok: true });
    expect(check({ session: session(false) }).ok).toBe(false);
    expect(check({ session: session(true, 'APPROVAL') }).ok).toBe(false);
    expect(check({ authorization: null }).ok).toBe(false);
    expect(check({ authorization: auth({ taskType: 'outra' }) }).ok).toBe(false);
    expect(check({ authorization: auth({ status: 'PAUSED' }) }).ok).toBe(false);
    expect(check({ authorization: auth({ companyId: 'c2' }) }).ok).toBe(false);
    expect(check({ authorization: auth({ createdByUserId: 'system' }) }).ok).toBe(false);
    expect(check({ executionsToday: 2 }).ok).toBe(false);
    expect(check({ task: task({ localHour: 22 }) }).ok).toBe(false);
    expect(check({ task: task({ estimatedSpendCents: 900 }) }).ok).toBe(false);
    expect(check({ task: task({ audienceSize: 500 }) }).ok).toBe(false);
    // Fila antiga (ex.: reativação depois de downgrade) não roda sozinha.
    expect(check({ task: task({ createdAt: new Date(NOW.getTime() - 3 * 3_600_000) }) }).ok).toBe(
      false,
    );
  });

  it('categorias sensíveis e tarefas não implementadas nunca rodam sozinhas', () => {
    expect(
      check({ authorization: auth({ taskType: 'massa' }), task: task({ type: 'massa' }) }).ok,
    ).toBe(false);
    expect(
      check({ authorization: auth({ taskType: 'futura' }), task: task({ type: 'futura' }) }).ok,
    ).toBe(false);
  });
});
