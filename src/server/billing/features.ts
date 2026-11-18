import { prisma } from '@/lib/db';
import type { Company } from '@/generated/prisma/client';
import { resolveEntitlements, type Entitlements } from '@/lib/billing/entitlements';
import {
  PLANS,
  TRIAL_GRANT,
  getPlan,
  professionalsLimitLabel,
  type FeatureKey,
  type PlanId,
} from '@/lib/billing/plans';
import { UserError } from '@/server/errors';
import { buildUpgradeOffer, type UpgradeOffer } from '@/lib/billing/upgrade';
import {
  FEATURE_NAME,
  FEATURE_TRIAL_DAYS,
  activeTrialKeys,
  featureName,
  featureTrialStatus,
  isTrialable,
  newTrial,
  parseFeatureTrials,
} from '@/lib/billing/feature-trials';
import { billingConfigured } from '@/server/billing/subscription';

/*
  Direito comercial às funcionalidades de gestão (plans.ts). É uma das cinco coisas que nunca se
  misturam: direito do plano (aqui), disponibilidade técnica (integração configurada), permissão
  da pessoa (admin/fichas), saldo (franquia de IA) e autorização para executar (aprovação).

  Sem acesso pago e com a cobrança ainda desligada (BILLING_ENFORCE), vale o plano escolhido (ou
  o do teste) — o mesmo critério do resto do sistema, que só bloqueia quando a cobrança vale.
*/

type CompanyPlanFields = Pick<
  Company,
  'plan' | 'subscriptionStatus' | 'trialEndsAt' | 'currentPeriodEnd'
> &
  Partial<Pick<Company, 'courtesyUntil' | 'courtesyPlan' | 'featureTrials'>>;

const PLAN_FIELDS = {
  plan: true,
  subscriptionStatus: true,
  trialEndsAt: true,
  currentPeriodEnd: true,
  courtesyUntil: true,
  courtesyPlan: true,
  featureTrials: true,
} as const;

export type FeatureAccess = {
  planId: PlanId | null;
  planName: string | null;
  /** O que vale agora: o plano mais os recursos em teste grátis. */
  features: Record<FeatureKey, boolean>;
  /** Só o que o plano inclui (sem os testes). */
  planFeatures: Record<FeatureKey, boolean>;
  /** Recursos liberados por teste grátis agora, com o fim de cada um. */
  trials: { key: FeatureKey; endsAt: string }[];
  entitlements: Entitlements;
};

/**
 * Soma ao plano os recursos em teste grátis (3 dias, uma vez por recurso). Só vale para quem tem
 * um plano valendo: com o acesso bloqueado, o teste também não abre nada.
 */
function withTrials(
  base: Omit<FeatureAccess, 'features' | 'trials' | 'planFeatures'> & {
    features: Record<FeatureKey, boolean>;
  },
  company: CompanyPlanFields,
  now: Date,
): FeatureAccess {
  const trials = parseFeatureTrials(company.featureTrials);
  const active =
    base.planId === null ? [] : activeTrialKeys(trials, now).filter((key) => !base.features[key]);
  const features = { ...base.features };
  for (const key of active) features[key] = true;
  return {
    ...base,
    features,
    planFeatures: base.features,
    trials: active.map((key) => ({ key, endsAt: trials[key]!.endsAt })),
  };
}

/** Plano mais barato que inclui a funcionalidade (para a mensagem de "disponível no plano X"). */
export function cheapestPlanWith(key: FeatureKey) {
  return PLANS.filter((p) => p.offered && p.features[key]).sort(
    (a, b) => a.priceCents - b.priceCents,
  )[0];
}

export function featureAccessFor(company: CompanyPlanFields, now = new Date()): FeatureAccess {
  const entitlements = resolveEntitlements(company, { now });
  if (entitlements.source !== 'none') {
    return withTrials(
      {
        planId: entitlements.planId,
        planName: entitlements.planName,
        features: entitlements.features,
        entitlements,
      },
      company,
      now,
    );
  }
  const enforced = process.env.BILLING_ENFORCE === 'true' && billingConfigured();
  const fallback = enforced ? undefined : (getPlan(company.plan) ?? getPlan(TRIAL_GRANT.basePlan));
  return withTrials(
    {
      planId: fallback?.id ?? null,
      planName: fallback?.name ?? null,
      features: fallback?.features ?? entitlements.features,
      entitlements,
    },
    company,
    now,
  );
}

export function featureBlockedMessage(key: FeatureKey): string {
  const plan = cheapestPlanWith(key);
  return plan
    ? `Este recurso está disponível a partir do plano ${plan.name}. O restante do sistema continua funcionando.`
    : 'Este recurso não está disponível no seu plano.';
}

export class FeatureUnavailableError extends UserError {
  constructor(readonly feature: FeatureKey) {
    super(featureBlockedMessage(feature));
    this.name = 'FeatureUnavailableError';
  }
}

/**
 * Convite para o plano que libera o recurso — `null` quando o plano atual já inclui (ou o recurso
 * está em teste grátis agora). Diz também se ainda dá para testar grátis.
 */
export function upgradeOffer(company: CompanyPlanFields, key: FeatureKey): UpgradeOffer | null {
  const now = new Date();
  const access = featureAccessFor(company, now);
  if (access.features[key]) return null;
  const offer = buildUpgradeOffer(key, access.planId);
  if (!offer) return null;
  const status = featureTrialStatus(parseFeatureTrials(company.featureTrials), key, now);
  return {
    ...offer,
    feature: key,
    trial:
      access.planId === null || status.state === 'not_trialable'
        ? null
        : status.state === 'used'
          ? { available: false, endedAt: status.endedAt, days: FEATURE_TRIAL_DAYS }
          : { available: true, endedAt: null, days: FEATURE_TRIAL_DAYS },
  };
}

/** Recursos fora do plano que têm teste grátis, com a situação de cada um (página Assinatura). */
export function trialCatalog(company: CompanyPlanFields, now = new Date()) {
  const access = featureAccessFor(company, now);
  if (access.planId === null) return [];
  const trials = parseFeatureTrials(company.featureTrials);
  return (Object.keys(FEATURE_NAME) as FeatureKey[])
    .filter((key) => !access.planFeatures[key] && isTrialable(key))
    .map((key) => ({
      key,
      name: featureName(key),
      planName: cheapestPlanWith(key)?.name ?? null,
      status: featureTrialStatus(trials, key, now),
    }));
}

/**
 * Começa o teste grátis de 3 dias de um recurso fora do plano (uma vez por recurso). A linha da
 * empresa fica travada na conferência, para dois cliques não abrirem dois testes.
 */
export async function startFeatureTrial(companyId: string, key: FeatureKey, now = new Date()) {
  if (!isTrialable(key)) {
    throw new UserError('Este recurso não tem teste grátis. Ele está disponível nos planos pagos.');
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Company" WHERE id = ${companyId} FOR UPDATE`;
    const company = await tx.company.findUnique({ where: { id: companyId }, select: PLAN_FIELDS });
    if (!company) throw new UserError('Empresa não encontrada.');
    const access = featureAccessFor(company, now);
    if (access.planId === null) {
      throw new UserError('Para testar um recurso, a assinatura precisa estar em dia.');
    }
    if (access.planFeatures[key]) throw new UserError('Seu plano já inclui este recurso.');
    const trials = parseFeatureTrials(company.featureTrials);
    const status = featureTrialStatus(trials, key, now);
    if (status.state === 'active') return trials[key]!;
    if (status.state === 'used') {
      throw new UserError(
        'Você já testou este recurso. Para continuar usando, escolha um plano que o inclua.',
      );
    }
    const trial = newTrial(now);
    await tx.company.update({
      where: { id: companyId },
      data: { featureTrials: { ...trials, [key]: trial } },
    });
    return trial;
  });
}

export function hasFeature(company: CompanyPlanFields, key: FeatureKey): boolean {
  return featureAccessFor(company).features[key] === true;
}

/** Confere no servidor; a tela esconder o botão nunca basta. */
export function assertFeature(company: CompanyPlanFields, key: FeatureKey) {
  if (!hasFeature(company, key)) throw new FeatureUnavailableError(key);
}

/** Para rotinas e páginas públicas, onde só há o id da empresa. */
export async function assertCompanyFeature(companyId: string, key: FeatureKey) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: PLAN_FIELDS,
  });
  if (!company) throw new UserError('Empresa não encontrada.');
  assertFeature(company, key);
}

export async function companyHasFeature(companyId: string, key: FeatureKey): Promise<boolean> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: PLAN_FIELDS,
  });
  return company ? hasFeature(company, key) : false;
}

/**
 * Barra cadastrar (ou reativar) profissionais além do limite do plano. Quem já passou do limite
 * continua com a equipe que tem; só não acrescenta.
 */
export async function assertProfessionalSlots(
  company: CompanyPlanFields & { id: string },
  adding = 1,
) {
  const plan = getPlan(featureAccessFor(company).planId);
  if (!plan || plan.maxProfessionals === null) return;
  const active = await prisma.professional.count({
    where: { companyId: company.id, active: true },
  });
  if (active + adding <= plan.maxProfessionals) return;
  const bigger = PLANS.filter(
    (p) =>
      p.offered &&
      p.checkoutEnabled &&
      (p.maxProfessionals === null || p.maxProfessionals >= active + adding),
  ).sort((a, b) => a.priceCents - b.priceCents)[0];
  throw new UserError(
    `O plano ${plan.name} permite ${professionalsLimitLabel(plan.maxProfessionals)}.` +
      (bigger ? ` Para ter mais, troque para o plano ${bigger.name} em Assinatura.` : ''),
  );
}
