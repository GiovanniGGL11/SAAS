'use client';

import { useQuery } from '@tanstack/react-query';

import type { FeatureKey } from '@/lib/billing/plans';
import { getPlanFeaturesAction } from '@/server/actions/plan-actions';

/** Funcionalidades do plano (para esconder o que não está incluído; o servidor confere de novo). */
export function usePlanFeatures() {
  const query = useQuery({
    queryKey: ['plan-features'],
    queryFn: () => getPlanFeaturesAction(),
    staleTime: 5 * 60_000,
  });
  const has = (key: FeatureKey) => query.data?.features[key] === true;
  return { ...query, has };
}
