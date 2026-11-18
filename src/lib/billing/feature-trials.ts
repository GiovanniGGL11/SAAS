import type { FeatureKey } from '@/lib/billing/plans';

/*
  "Testar grátis": um recurso fora do plano pode ser liberado DE VERDADE por 3 dias, uma vez só
  por recurso. O que a pessoa fizer no teste fica guardado (volta a travar, não some), igual a
  trocar de plano. Fica gravado em Company.featureTrials.

  Ficam fora do teste os recursos que mandam mensagens sozinhos para os clientes ou rodam rotinas
  automáticas (para nenhum cliente receber mensagem de um teste) e várias unidades (unidade
  criada no teste ficaria travada depois).
*/

export const FEATURE_TRIAL_DAYS = 3;

export const NON_TRIALABLE: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  'whatsappAutomation',
  'campaigns',
  'waitlistAutomation',
  'dailySummaryAuto',
  'packageRenewal',
  'automationRules',
  'automationResults',
  'multiUnit',
]);

export type FeatureTrial = { startedAt: string; endsAt: string };
export type FeatureTrials = Partial<Record<FeatureKey, FeatureTrial>>;

export function isTrialable(key: FeatureKey): boolean {
  return !NON_TRIALABLE.has(key);
}

/** Lê o JSON gravado, ignorando o que não tiver o formato certo. */
export function parseFeatureTrials(value: unknown): FeatureTrials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: FeatureTrials = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const { startedAt, endsAt } = raw as Record<string, unknown>;
    if (typeof startedAt !== 'string' || typeof endsAt !== 'string') continue;
    if (Number.isNaN(Date.parse(endsAt))) continue;
    out[key as FeatureKey] = { startedAt, endsAt };
  }
  return out;
}

export type FeatureTrialStatus =
  | { state: 'available' }
  | { state: 'active'; endsAt: string }
  | { state: 'used'; endedAt: string }
  | { state: 'not_trialable' };

export function featureTrialStatus(
  trials: FeatureTrials,
  key: FeatureKey,
  now: Date = new Date(),
): FeatureTrialStatus {
  if (!isTrialable(key)) return { state: 'not_trialable' };
  const trial = trials[key];
  if (!trial) return { state: 'available' };
  return Date.parse(trial.endsAt) > now.getTime()
    ? { state: 'active', endsAt: trial.endsAt }
    : { state: 'used', endedAt: trial.endsAt };
}

/** Recursos com teste valendo agora. */
export function activeTrialKeys(trials: FeatureTrials, now: Date = new Date()): FeatureKey[] {
  return (Object.keys(trials) as FeatureKey[]).filter(
    (key) => isTrialable(key) && Date.parse(trials[key]!.endsAt) > now.getTime(),
  );
}

/** Começa o teste (3 dias a partir de agora). */
export function newTrial(now: Date = new Date()): FeatureTrial {
  return {
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + FEATURE_TRIAL_DAYS * 86_400_000).toISOString(),
  };
}

/** Nome curto de cada recurso, para os avisos ("Você está testando: Comissões"). */
export const FEATURE_NAME: Partial<Record<FeatureKey, string>> = {
  commissions: 'Comissões',
  reports: 'Relatórios',
  packages: 'Pacotes e assinaturas',
  forms: 'Fichas e formulários',
  clientPortal: 'Área do cliente',
  quotes: 'Orçamentos',
  waitlistInvites: 'Lista de espera',
  assistedImport: 'Importação assistida',
  dailySummary: 'Resumo do dia',
  checklists: 'Checklist do atendimento',
  contributionMargin: 'Margem por serviço',
  crm: 'Funil de vendas',
  customFields: 'Campos personalizados',
  surveys: 'Pesquisa de satisfação',
  referrals: 'Indicações',
  serviceTracking: 'Serviços em andamento',
  advancedKpis: 'Indicadores avançados',
  pricingCalculator: 'Calculadora de preço',
  profitAnalysis: 'Lucro e DRE gerencial',
};

export function featureName(key: FeatureKey): string {
  return FEATURE_NAME[key] ?? key;
}
