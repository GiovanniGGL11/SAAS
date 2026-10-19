import { prisma } from '@/lib/db';
import type { Company } from '@/generated/prisma/client';
import { resolveEntitlements, type Entitlements } from '@/lib/billing/entitlements';
import { PLANS, TRIAL_GRANT, getPlan, type FeatureKey, type PlanId } from '@/lib/billing/plans';
import { UserError } from '@/server/errors';
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
>;

export type FeatureAccess = {
  planId: PlanId | null;
  planName: string | null;
  features: Record<FeatureKey, boolean>;
  entitlements: Entitlements;
};

/** Plano mais barato que inclui a funcionalidade (para a mensagem de "disponível no plano X"). */
export function cheapestPlanWith(key: FeatureKey) {
  return PLANS.filter((p) => p.offered && p.features[key]).sort(
    (a, b) => a.priceCents - b.priceCents,
  )[0];
}

export function featureAccessFor(company: CompanyPlanFields, now = new Date()): FeatureAccess {
  const entitlements = resolveEntitlements(company, { now });
  if (entitlements.source !== 'none') {
    return {
      planId: entitlements.planId,
      planName: entitlements.planName,
      features: entitlements.features,
      entitlements,
    };
  }
  const enforced = process.env.BILLING_ENFORCE === 'true' && billingConfigured();
  const fallback = enforced ? undefined : (getPlan(company.plan) ?? getPlan(TRIAL_GRANT.basePlan));
  return {
    planId: fallback?.id ?? null,
    planName: fallback?.name ?? null,
    features: fallback?.features ?? entitlements.features,
    entitlements,
  };
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
    select: { plan: true, subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true },
  });
  if (!company) throw new UserError('Empresa não encontrada.');
  assertFeature(company, key);
}

export async function companyHasFeature(companyId: string, key: FeatureKey): Promise<boolean> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { plan: true, subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true },
  });
  return company ? hasFeature(company, key) : false;
}
