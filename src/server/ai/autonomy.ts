import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { AUTONOMY_LABEL, type AutonomyMode } from '@/lib/billing/entitlements';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';
import { AiAccessError, type AiSession } from '@/server/ai/access';

/*
  Autonomia da IA.
  - SUGGEST: consulta e sugere; não prepara alterações.
  - APPROVAL (padrão): prepara alterações; executa só depois da confirmação da pessoa.
  - AUTO_RULES (só Pro): executa SOZINHA apenas tarefas com autorização ativa, por tipo de tarefa,
    dentro de escopo e limites. Nunca uma permissão genérica.

  Categorias sensíveis nunca rodam sozinhas nesta versão, e nenhuma automação altera a própria
  autorização: autorização só nasce e muda por ação de uma pessoa administradora.
*/

/** Controles específicos por categoria sensível. */
export const SENSITIVE_CATEGORIES = {
  price_change: { label: 'Alteração de preços', autoExecutionAllowed: false, adminOnly: true },
  deletion: { label: 'Exclusões', autoExecutionAllowed: false, adminOnly: true },
  refund: { label: 'Estornos', autoExecutionAllowed: false, adminOnly: true },
  financial: { label: 'Alterações financeiras', autoExecutionAllowed: false, adminOnly: true },
  mass_message: { label: 'Mensagens em massa', autoExecutionAllowed: false, adminOnly: true },
  clinical_record: {
    label: 'Fichas clínicas e documentos assinados',
    autoExecutionAllowed: false,
    adminOnly: false,
  },
} as const;
export type SensitiveCategory = keyof typeof SENSITIVE_CATEGORIES;

/**
 * Tarefas que podem receber autorização de execução automática. Só entram aqui rotinas que
 * existem de verdade; enquanto `implemented` for falso, nada é oferecido nem executado.
 */
export type AutomatableTask = {
  label: string;
  description: string;
  category: SensitiveCategory | null;
  implemented: boolean;
};

export const AUTOMATABLE_TASKS: Record<string, AutomatableTask> = {};

export type AuthorizationLimits = {
  /** Execuções por dia. */
  maxPerDay?: number;
  /** Faixa de horário local permitida, ex.: { from: 8, to: 20 }. */
  allowedHours?: { from: number; to: number };
  /** Teto de gasto por execução, em centavos. */
  maxSpendCents?: number;
  /** Tamanho máximo do público (para envios). */
  maxAudience?: number;
  /** Idade máxima de uma tarefa na fila (ms): fila antiga não roda sozinha ao reativar. */
  maxQueueAgeMs?: number;
};

export type AutoTask = {
  type: string;
  companyId: string;
  createdAt: Date;
  estimatedSpendCents?: number;
  audienceSize?: number;
  localHour: number;
};

export type AutoDecision = { ok: true } | { ok: false; reason: string };

const DEFAULT_MAX_QUEUE_AGE_MS = 60 * 60_000;

/**
 * Contrato da execução automática: só passa se TODAS as condições valerem. Qualquer automação
 * futura deve chamar isto imediatamente antes de executar (não ao enfileirar).
 */
export function canAutoExecute(params: {
  session: Pick<AiSession, 'companyId' | 'entitlements' | 'autonomy'>;
  authorization: {
    companyId: string;
    taskType: string;
    status: 'ACTIVE' | 'PAUSED' | 'REVOKED';
    limits: AuthorizationLimits | null;
    createdByUserId: string;
  } | null;
  task: AutoTask;
  executionsToday: number;
  now?: Date;
  registry?: Record<string, AutomatableTask>;
}): AutoDecision {
  const now = params.now ?? new Date();
  const registry = params.registry ?? AUTOMATABLE_TASKS;
  const { session, authorization, task } = params;
  if (!session.entitlements.ai.available.autoExecution) {
    return { ok: false, reason: 'O plano atual não inclui execução automática.' };
  }
  if (session.autonomy.effective !== 'AUTO_RULES') {
    return { ok: false, reason: 'A empresa não está no modo "Executar regras autorizadas".' };
  }
  const definition = registry[task.type];
  if (!definition?.implemented)
    return { ok: false, reason: 'Tarefa não disponível para automação.' };
  if (definition.category && !SENSITIVE_CATEGORIES[definition.category].autoExecutionAllowed) {
    return {
      ok: false,
      reason: `${SENSITIVE_CATEGORIES[definition.category].label} sempre pedem aprovação.`,
    };
  }
  if (
    !authorization ||
    authorization.companyId !== session.companyId ||
    task.companyId !== session.companyId
  ) {
    return { ok: false, reason: 'Sem autorização para esta tarefa nesta empresa.' };
  }
  if (authorization.taskType !== task.type)
    return { ok: false, reason: 'A autorização é de outra tarefa.' };
  if (authorization.status !== 'ACTIVE')
    return { ok: false, reason: 'Autorização pausada ou revogada.' };
  if (!authorization.createdByUserId.startsWith('user_')) {
    return { ok: false, reason: 'Autorização sem uma pessoa responsável.' };
  }
  const limits = authorization.limits ?? {};
  if (
    now.getTime() - task.createdAt.getTime() >
    (limits.maxQueueAgeMs ?? DEFAULT_MAX_QUEUE_AGE_MS)
  ) {
    return { ok: false, reason: 'Tarefa antiga na fila: precisa de nova aprovação.' };
  }
  if (limits.maxPerDay !== undefined && params.executionsToday >= limits.maxPerDay) {
    return { ok: false, reason: 'Limite diário da autorização atingido.' };
  }
  if (
    limits.allowedHours &&
    (task.localHour < limits.allowedHours.from || task.localHour >= limits.allowedHours.to)
  ) {
    return { ok: false, reason: 'Fora do horário autorizado.' };
  }
  if (
    limits.maxSpendCents !== undefined &&
    (task.estimatedSpendCents ?? 0) > limits.maxSpendCents
  ) {
    return { ok: false, reason: 'Acima do limite de gasto autorizado.' };
  }
  if (limits.maxAudience !== undefined && (task.audienceSize ?? 0) > limits.maxAudience) {
    return { ok: false, reason: 'Público maior que o autorizado.' };
  }
  return { ok: true };
}

/** Só administrador muda o modo; "Executar regras autorizadas" exige o recurso disponível (Pro). */
export async function setAutonomyMode(session: AiSession, mode: AutonomyMode) {
  if (!session.isAdmin)
    throw new AiAccessError('not_allowed', 'Só administradores mudam a autonomia da IA.');
  if (mode !== 'SUGGEST' && !session.entitlements.ai.available.assistedActions) {
    throw new AiAccessError(session.entitlements.ai.reasons.assistedActions ?? 'not_in_plan');
  }
  if (mode === 'AUTO_RULES' && !session.entitlements.ai.available.autoExecution) {
    throw new AiAccessError(session.entitlements.ai.reasons.autoExecution ?? 'not_in_plan');
  }
  await prisma.company.update({ where: { id: session.companyId }, data: { aiAutonomyMode: mode } });
  await recordAuditLog({
    companyId: session.companyId,
    entityType: 'Company',
    entityId: session.companyId,
    action: 'updated',
    userId: session.userId,
    metadata: { fields: ['aiAutonomyMode'], aiAutonomyMode: AUTONOMY_LABEL[mode] },
  });
}

export async function createAuthorization(
  session: AiSession,
  input: { taskType: string; scope?: Prisma.InputJsonValue; limits?: AuthorizationLimits },
) {
  if (!session.isAdmin)
    throw new AiAccessError('not_allowed', 'Só administradores autorizam rotinas.');
  if (!session.entitlements.ai.available.autoExecution) {
    throw new AiAccessError(session.entitlements.ai.reasons.autoExecution ?? 'not_in_plan');
  }
  const task = AUTOMATABLE_TASKS[input.taskType];
  if (!task?.implemented) throw new UserError('Esta rotina não está disponível.');
  if (task.category && !SENSITIVE_CATEGORIES[task.category].autoExecutionAllowed) {
    throw new UserError(
      `${SENSITIVE_CATEGORIES[task.category].label} não podem rodar sem aprovação.`,
    );
  }
  return prisma.aiTaskAuthorization.create({
    data: {
      companyId: session.companyId,
      taskType: input.taskType,
      scope: input.scope,
      limits: input.limits as Prisma.InputJsonValue,
      createdByUserId: session.userId,
      updatedByUserId: session.userId,
    },
  });
}

/** Pausar ou revogar é sempre permitido ao administrador (inclusive depois de downgrade). */
export async function setAuthorizationStatus(
  session: AiSession,
  id: string,
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED',
) {
  if (!session.isAdmin)
    throw new AiAccessError('not_allowed', 'Só administradores mudam autorizações.');
  if (status === 'ACTIVE' && !session.entitlements.ai.available.autoExecution) {
    throw new AiAccessError(session.entitlements.ai.reasons.autoExecution ?? 'not_in_plan');
  }
  const result = await prisma.aiTaskAuthorization.updateMany({
    where: { id, companyId: session.companyId, status: { not: 'REVOKED' } },
    data: {
      status,
      updatedByUserId: session.userId,
      pausedReason: status === 'PAUSED' ? 'Pausada por administrador' : null,
    },
  });
  if (result.count === 0) throw new UserError('Autorização não encontrada.');
}

/** Lista com o estado efetivo: sem execução automática no plano, aparece pausada (sem apagar). */
export async function listAuthorizations(session: AiSession) {
  const rows = await prisma.aiTaskAuthorization.findMany({
    where: { companyId: session.companyId, status: { not: 'REVOKED' } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => ({
    id: row.id,
    taskType: row.taskType,
    label: AUTOMATABLE_TASKS[row.taskType]?.label ?? row.taskType,
    status: row.status,
    effectiveStatus:
      row.status === 'ACTIVE' && !session.entitlements.ai.available.autoExecution
        ? 'PAUSED_BY_PLAN'
        : row.status,
    createdAt: row.createdAt,
  }));
}
