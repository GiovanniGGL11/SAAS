'use server';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { featureAccessFor } from '@/server/billing/features';

/**
 * O que o plano da empresa libera, para a tela esconder o que não existe no plano. Cada ação
 * confere de novo no servidor — esconder o botão nunca é a proteção.
 */
export async function getPlanFeaturesAction() {
  const { company } = await requireCurrentCompany();
  const access = featureAccessFor(company);
  return { planId: access.planId, planName: access.planName, features: access.features };
}
