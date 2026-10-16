import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { AI_PROVIDER_PRICING } from '@/lib/billing/plans';

/*
  Medição de custo. Guarda só números (tokens, chamadas, duração, custo estimado) e o tipo da
  operação — nunca o texto das mensagens, dados de clientes ou respostas de fichas.
*/

export type ProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Outros consumos informados pelo provedor (ex.: tokens de raciocínio). */
  other?: Record<string, number>;
};

export function emptyUsage(): ProviderUsage {
  return { inputTokens: 0, outputTokens: 0, other: {} };
}

export function addUsage(total: ProviderUsage, part: ProviderUsage) {
  total.inputTokens += part.inputTokens;
  total.outputTokens += part.outputTokens;
  for (const [key, value] of Object.entries(part.other ?? {})) {
    total.other = { ...total.other, [key]: (total.other?.[key] ?? 0) + value };
  }
}

/** Custo estimado em milionésimos da moeda do provedor (tokens de raciocínio contam como saída). */
export function estimateCostMicros(model: string, usage: ProviderUsage) {
  const price = AI_PROVIDER_PRICING[model];
  if (!price) return { micros: 0, currency: 'USD' };
  const output = usage.outputTokens + (usage.other?.thoughtsTokens ?? 0);
  const micros = usage.inputTokens * price.inputPerMillion + output * price.outputPerMillion;
  return { micros: Math.round(micros), currency: price.currency };
}

export async function recordUsageEvent(params: {
  companyId: string;
  userId: string | null;
  feature: string;
  provider: string;
  model: string | null;
  usage: ProviderUsage;
  calls: number;
  units: number;
  audioSeconds?: number | null;
  outcome: 'SUCCEEDED' | 'FAILED' | 'BLOCKED';
  errorCode?: string | null;
}) {
  const cost = params.model
    ? estimateCostMicros(params.model, params.usage)
    : { micros: 0, currency: 'USD' };
  await prisma.aiUsageEvent.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      feature: params.feature,
      provider: params.provider,
      model: params.model,
      inputTokens: params.usage.inputTokens,
      outputTokens: params.usage.outputTokens,
      otherUsage: Object.keys(params.usage.other ?? {}).length
        ? (params.usage.other as Prisma.InputJsonValue)
        : undefined,
      audioSeconds: params.audioSeconds ?? null,
      calls: params.calls,
      units: params.units,
      estimatedCostMicros: cost.micros,
      currency: cost.currency,
      outcome: params.outcome,
      errorCode: params.errorCode ?? null,
    },
  });
}
