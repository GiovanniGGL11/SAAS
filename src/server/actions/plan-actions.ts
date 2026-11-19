'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { featureAccessFor, startFeatureTrial } from '@/server/billing/features';
import { getPlan, type FeatureKey } from '@/lib/billing/plans';

/**
 * O que o plano da empresa libera, para a tela esconder o que não existe no plano. Cada ação
 * confere de novo no servidor — esconder o botão nunca é a proteção.
 */
export async function getPlanFeaturesAction() {
  const { company } = await requireCurrentCompany();
  const access = featureAccessFor(company);
  return {
    planId: access.planId,
    planName: access.planName,
    features: access.features,
    trials: access.trials,
  };
}

const FEATURE_KEYS = Object.keys(getPlan('pro')!.features) as [FeatureKey, ...FeatureKey[]];

/** "Testar grátis por 3 dias": só o dono/administrador começa; uma vez por recurso. */
export async function startFeatureTrialAction(input: unknown) {
  return toActionResult(async () => {
    const { feature } = z.object({ feature: z.enum(FEATURE_KEYS) }).parse(input);
    const { company } = await requireCompanyAdmin();
    const trial = await startFeatureTrial(company.id, feature);
    revalidatePath('/', 'layout');
    return trial;
  });
}
