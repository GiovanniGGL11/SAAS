import {
  AI_IMPLEMENTED,
  DEV_PROVISIONAL_AI_UNITS,
  PAST_DUE_GRACE_DAYS,
  TRIAL_GRANT,
  effectiveTrialEnd,
  getPlan,
  type AiPlanEntitlements,
  type FeatureKey,
  type Plan,
  type PlanId,
} from '@/lib/billing/plans';

/*
  O que a empresa pode usar AGORA, calculado de quatro coisas que não se confundem:
  1. plano contratado (o que está incluído — plans.ts);
  2. situação da assinatura (teste, ativa, atrasada, cancelada) e datas;
  3. o que está implementado de verdade (AI_IMPLEMENTED);
  4. franquia definida.
  Permissão da pessoa, saldo do mês e aprovação de cada ação são conferidos à parte, no servidor.
  Função pura: a tela e o servidor usam a mesma.
*/

export type SubscriptionStatusValue = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

export type AccessSource =
  /** Teste grátis em andamento (concessão temporária). */
  | 'trial'
  /** Assinatura em dia. */
  | 'subscription'
  /** Cancelada, mas dentro do período já pago. */
  | 'paid_period'
  /** Pagamento atrasado, dentro da tolerância: uso manual sim, IA pausada. */
  | 'grace'
  /** Sem acesso pago (teste acabou e não há assinatura em dia). */
  | 'none';

export type AiBlockReason =
  'not_in_plan' | 'not_implemented' | 'past_due' | 'no_subscription' | 'quota_not_configured';

export const AI_BLOCK_MESSAGE: Record<
  AiBlockReason | 'quota_exhausted' | 'provider_not_configured',
  string
> = {
  not_in_plan: 'O assistente de IA está disponível nos planos Profissional e Pro.',
  not_implemented: 'Este recurso de IA ainda não está disponível.',
  past_due:
    'O pagamento da assinatura está em atraso: a IA fica pausada até a regularização. O restante do sistema continua funcionando.',
  no_subscription:
    'Sem assinatura ativa, a IA fica indisponível. O restante do sistema segue conforme a sua assinatura.',
  quota_not_configured:
    'A franquia de IA do seu plano ainda não foi configurada, então a IA está pausada. O uso manual do sistema continua normal.',
  quota_exhausted:
    'A franquia de IA deste mês acabou. Novos pedidos à IA ficam pausados até o próximo mês; o uso manual do sistema continua normal.',
  provider_not_configured:
    'O assistente não está configurado no servidor (falta a chave do provedor de IA).',
};

export type AiCapability =
  'assistant' | 'voice' | 'assistedActions' | 'aiAutomations' | 'autoExecution';

export type Entitlements = {
  planId: PlanId | null;
  planName: string | null;
  source: AccessSource;
  /** Teste: até quando. */
  trialEndsAt: Date | null;
  features: Record<FeatureKey, boolean>;
  maxProfessionals: number | null;
  maxUnits: number | null;
  ai: {
    /** O que o plano inclui (independe de estar implementado ou de pagamento em dia). */
    included: AiPlanEntitlements | null;
    /** Disponível agora, por recurso. */
    available: Record<AiCapability, boolean>;
    /** Motivo de indisponibilidade, por recurso. */
    reasons: Partial<Record<AiCapability, AiBlockReason>>;
    /** Franquia do mês resolvida (0 = nada). */
    monthlyUnits: number;
    /** Franquia veio do valor provisório de desenvolvimento. */
    provisionalUnits: boolean;
    maxStepsPerRequest: number;
    maxRequestSeconds: number;
    maxAudioSecondsPerCommand: number;
  };
};

const NO_FEATURES = (plan: Plan | undefined): Record<FeatureKey, boolean> =>
  Object.fromEntries(
    Object.keys(plan?.features ?? getPlan('essencial')!.features).map((k) => [k, false]),
  ) as Record<FeatureKey, boolean>;

export function resolveEntitlements(
  company: {
    plan: string | null;
    subscriptionStatus: SubscriptionStatusValue;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
  },
  options: { now?: Date; production?: boolean } = {},
): Entitlements {
  const now = options.now ?? new Date();
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const trialEnd = effectiveTrialEnd(company);
  const inTrial = trialEnd.getTime() > now.getTime() && company.subscriptionStatus === 'TRIAL';
  const chosen = getPlan(company.plan);
  const periodEnd = company.currentPeriodEnd?.getTime() ?? 0;

  let source: AccessSource = 'none';
  let plan: Plan | undefined;
  if (company.subscriptionStatus === 'ACTIVE' && chosen) {
    source = 'subscription';
    plan = chosen;
  } else if (inTrial) {
    source = 'trial';
    plan = chosen ?? getPlan(TRIAL_GRANT.basePlan);
  } else if (company.subscriptionStatus === 'CANCELED' && chosen && periodEnd > now.getTime()) {
    source = 'paid_period';
    plan = chosen;
  } else if (company.subscriptionStatus === 'PAST_DUE' && chosen) {
    if (periodEnd > now.getTime()) {
      source = 'subscription';
      plan = chosen;
    } else if (periodEnd + PAST_DUE_GRACE_DAYS * 86_400_000 > now.getTime()) {
      source = 'grace';
      plan = chosen;
    }
  }

  const included = plan ? plan.ai : null;
  const capabilities: AiCapability[] = [
    'assistant',
    'voice',
    'assistedActions',
    'aiAutomations',
    'autoExecution',
  ];

  // Franquia: no teste vale a do teste (se o plano inclui IA); sem definição, só em desenvolvimento.
  const rawUnits =
    source === 'trial' && included?.assistant
      ? TRIAL_GRANT.aiMonthlyUnits
      : included
        ? included.monthlyUnits
        : 0;
  const provisionalUnits = rawUnits === null && !production;
  const monthlyUnits = rawUnits === null ? (production ? 0 : DEV_PROVISIONAL_AI_UNITS) : rawUnits;

  const available = {} as Record<AiCapability, boolean>;
  const reasons: Partial<Record<AiCapability, AiBlockReason>> = {};
  for (const capability of capabilities) {
    let reason: AiBlockReason | null = null;
    if (source === 'none') reason = 'no_subscription';
    else if (!included?.[capability]) reason = 'not_in_plan';
    else if (!AI_IMPLEMENTED[capability]) reason = 'not_implemented';
    else if (source === 'grace') reason = 'past_due';
    // Executar o que já foi aprovado não chama o modelo; os demais consomem franquia.
    else if (capability !== 'assistedActions' && monthlyUnits <= 0) reason = 'quota_not_configured';
    available[capability] = reason === null;
    if (reason) reasons[capability] = reason;
  }
  // Execução com aprovação só faz sentido com o assistente incluído no plano.
  if (available.assistedActions && !included?.assistant) {
    available.assistedActions = false;
    reasons.assistedActions = 'not_in_plan';
  }

  return {
    planId: plan?.id ?? null,
    planName: plan?.name ?? null,
    source,
    trialEndsAt: source === 'trial' ? trialEnd : null,
    features: plan ? plan.features : NO_FEATURES(chosen),
    maxProfessionals: plan?.maxProfessionals ?? null,
    maxUnits: plan?.maxUnits ?? null,
    ai: {
      included,
      available,
      reasons,
      monthlyUnits,
      provisionalUnits,
      maxStepsPerRequest: included?.maxStepsPerRequest ?? 0,
      maxRequestSeconds: included?.maxRequestSeconds ?? 0,
      maxAudioSecondsPerCommand: included?.maxAudioSecondsPerCommand ?? 0,
    },
  };
}

// ---- Autonomia ----------------------------------------------------------------------------------

export type AutonomyMode = 'SUGGEST' | 'APPROVAL' | 'AUTO_RULES';

export const AUTONOMY_LABEL: Record<AutonomyMode, string> = {
  SUGGEST: 'Sugerir',
  APPROVAL: 'Pedir aprovação',
  AUTO_RULES: 'Executar regras autorizadas',
};

/**
 * Modo que vale de fato. "Executar regras autorizadas" sem o plano Pro (ou sem a execução
 * automática implementada) cai para "Pedir aprovação" — a configuração fica guardada, pausada.
 * Sem execução assistida no plano, sobra só "Sugerir".
 */
export function effectiveAutonomy(stored: AutonomyMode, entitlements: Entitlements): AutonomyMode {
  if (!entitlements.ai.available.assistedActions) return 'SUGGEST';
  if (stored === 'AUTO_RULES' && !entitlements.ai.available.autoExecution) return 'APPROVAL';
  return stored;
}
