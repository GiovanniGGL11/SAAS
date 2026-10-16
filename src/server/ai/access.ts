import type { Company } from '@/generated/prisma/client';
import {
  AI_BLOCK_MESSAGE,
  effectiveAutonomy,
  resolveEntitlements,
  type AiBlockReason,
  type AiCapability,
  type AutonomyMode,
  type Entitlements,
} from '@/lib/billing/entitlements';
import { UserError } from '@/server/errors';

/*
  Porta de entrada de toda operação de IA. A empresa e a pessoa vêm SEMPRE da sessão do servidor
  (nunca de um id enviado pelo navegador). Conferido antes de montar qualquer dado ou chamar o
  provedor: plano + implementação + pagamento + franquia definida.
*/

export type AiSession = {
  companyId: string;
  companyName: string;
  timezone: string;
  userId: string;
  isAdmin: boolean;
  entitlements: Entitlements;
  autonomy: { stored: AutonomyMode; effective: AutonomyMode };
};

export class AiAccessError extends UserError {
  constructor(
    readonly reason: AiBlockReason | 'quota_exhausted' | 'provider_not_configured' | 'not_allowed',
    message?: string,
  ) {
    super(
      message ??
        (reason === 'not_allowed' ? 'Você não tem permissão para isso.' : AI_BLOCK_MESSAGE[reason]),
    );
    this.name = 'AiAccessError';
  }
}

export function buildAiSession(params: {
  company: Pick<
    Company,
    | 'id'
    | 'name'
    | 'timezone'
    | 'plan'
    | 'subscriptionStatus'
    | 'trialEndsAt'
    | 'currentPeriodEnd'
    | 'aiAutonomyMode'
  >;
  userId: string;
  isAdmin: boolean;
  now?: Date;
}): AiSession {
  const entitlements = resolveEntitlements(params.company, { now: params.now });
  return {
    companyId: params.company.id,
    companyName: params.company.name,
    timezone: params.company.timezone,
    userId: params.userId,
    isAdmin: params.isAdmin,
    entitlements,
    autonomy: {
      stored: params.company.aiAutonomyMode,
      effective: effectiveAutonomy(params.company.aiAutonomyMode, entitlements),
    },
  };
}

/** Lança com a mensagem certa se o recurso não estiver disponível agora para esta empresa. */
export function assertAiCapability(
  session: Pick<AiSession, 'entitlements'>,
  capability: AiCapability,
) {
  const { available, reasons } = session.entitlements.ai;
  if (!available[capability]) throw new AiAccessError(reasons[capability] ?? 'not_in_plan');
}

/** Estado resumido para a tela (o mesmo cálculo das validações do servidor). */
export function aiAccessSummary(session: AiSession) {
  const { ai } = session.entitlements;
  return {
    companyName: session.companyName,
    planName: session.entitlements.planName,
    source: session.entitlements.source,
    assistant: ai.available.assistant,
    assistantMessage: ai.available.assistant
      ? null
      : AI_BLOCK_MESSAGE[ai.reasons.assistant ?? 'not_in_plan'],
    voice: ai.available.voice,
    voiceMessage: ai.available.voice ? null : AI_BLOCK_MESSAGE[ai.reasons.voice ?? 'not_in_plan'],
    assistedActions: ai.available.assistedActions,
    autoExecution: ai.available.autoExecution,
    autonomy: session.autonomy,
    monthlyUnits: ai.monthlyUnits,
    provisionalUnits: ai.provisionalUnits,
    includedInPlan: !!ai.included?.assistant,
  };
}
