import { createHash } from 'node:crypto';

import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import {
  assistantActionSchema,
  type AssistantAction,
  type AssistantProposal,
} from '@/lib/assistant';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';
import { AiAccessError, assertAiCapability, type AiSession } from '@/server/ai/access';
import { describeAction, executeAction, type ExecutedAction } from '@/server/assistant/execute';
import type { AssistantContext } from '@/server/assistant/tools';

/*
  Propostas de alteração feitas pela IA. Ciclo: AWAITING_APPROVAL → EXECUTING → COMPLETED/FAILED
  (ou CANCELED/EXPIRED). A confirmação usa só o id: a ação executada é a que ficou guardada no
  servidor, nunca o que o navegador mandar. A passagem para EXECUTING é atômica — clique duplo ou
  nova tentativa não executam duas vezes. Antes de executar, tudo é conferido de novo; se o
  resumo mudou desde a aprovação, a proposta volta a pedir aprovação.
*/

export const PROPOSAL_TTL_MS = 30 * 60_000;

/** Tipos cujo conteúdo é sensível: apagado da proposta ao encerrar. */
const SENSITIVE_KINDS = new Set<AssistantAction['kind']>(['fill_form_draft']);

type Summary = Pick<AssistantProposal, 'title' | 'details'>;

export function hashSummary(summary: Summary): string {
  return createHash('sha256')
    .update(JSON.stringify([summary.title, summary.details]))
    .digest('hex');
}

function toProposal(row: {
  id: string;
  summary: unknown;
  status: string;
  expiresAt: Date;
}): AssistantProposal {
  const summary = row.summary as Summary;
  return {
    id: row.id,
    title: summary.title,
    details: summary.details,
    status: row.status as AssistantProposal['status'],
    expiresAt: row.expiresAt.toISOString(),
  };
}

const REDACTED_SUMMARY = (title: string): Prisma.InputJsonValue => ({
  title,
  details: [{ label: 'Conteúdo', value: 'Omitido depois de encerrada (dados sensíveis).' }],
});

/** Guarda a proposta (validada e descrita) e devolve o cartão para a tela. */
export async function createProposal(
  ctx: AssistantContext,
  action: AssistantAction,
  summary: Summary,
  origin: 'assistant' | 'automation' = 'assistant',
): Promise<AssistantProposal> {
  const row = await prisma.aiActionProposal.create({
    data: {
      companyId: ctx.companyId,
      userId: ctx.userId,
      origin,
      kind: action.kind,
      payload: action as unknown as Prisma.InputJsonValue,
      summary: summary as unknown as Prisma.InputJsonValue,
      summaryHash: hashSummary(summary),
      status: 'AWAITING_APPROVAL',
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
    },
  });
  return toProposal(row);
}

export type ConfirmOutcome =
  | {
      status: 'COMPLETED';
      message: string;
      link?: string;
      alreadyDone: boolean;
      effects: ExecutedAction | null;
    }
  | { status: 'CHANGED'; proposal: AssistantProposal };

function contextFor(
  session: AiSession,
  formAccess: AssistantContext['formAccess'],
): AssistantContext {
  return {
    companyId: session.companyId,
    companyName: session.companyName,
    timezone: session.timezone,
    userId: session.userId,
    isAdmin: session.isAdmin,
    formAccess,
  };
}

export async function confirmProposal(
  session: AiSession,
  proposalId: string,
  formAccess?: AssistantContext['formAccess'],
): Promise<ConfirmOutcome> {
  // Plano, pagamento e modo valem no momento de executar (downgrade bloqueia o que estava pendente).
  assertAiCapability(session, 'assistedActions');
  if (session.autonomy.effective === 'SUGGEST') {
    throw new AiAccessError('not_allowed', 'No modo "Sugerir" a IA não altera dados.');
  }

  // Quem pediu aprova a própria proposta; administradores aprovam as de qualquer pessoa (e a
  // execução usa as permissões de QUEM APROVA, conferidas de novo agora).
  const owner = session.isAdmin ? {} : { userId: session.userId };
  const claimed = await prisma.aiActionProposal.updateMany({
    where: {
      id: proposalId,
      companyId: session.companyId,
      ...owner,
      status: 'AWAITING_APPROVAL',
      expiresAt: { gt: new Date() },
    },
    data: { status: 'EXECUTING', decidedAt: new Date(), decidedByUserId: session.userId },
  });
  if (claimed.count === 0) {
    const row = await prisma.aiActionProposal.findFirst({
      where: { id: proposalId, companyId: session.companyId, ...owner },
    });
    if (!row) throw new UserError('Proposta não encontrada.');
    if (row.status === 'COMPLETED') {
      return {
        status: 'COMPLETED',
        message: row.resultMessage ?? 'Já concluída.',
        alreadyDone: true,
        effects: null,
      };
    }
    if (row.status === 'EXECUTING') throw new UserError('Esta ação já está sendo executada.');
    if (row.status === 'AWAITING_APPROVAL') {
      await expire(row.id, row.kind);
      throw new UserError('A proposta expirou. Peça de novo ao assistente.');
    }
    if (row.status === 'FAILED')
      throw new UserError(`Esta proposta já falhou: ${row.errorMessage ?? 'erro'}`);
    if (row.status === 'REJECTED') throw new UserError('Esta proposta foi recusada.');
    throw new UserError('Esta proposta foi cancelada ou expirou.');
  }

  const row = (await prisma.aiActionProposal.findUnique({ where: { id: proposalId } }))!;
  const ctx = contextFor(session, formAccess);
  try {
    const action = assistantActionSchema.parse(row.payload);
    const summary = await describeAction(ctx, action);
    const hash = hashSummary(summary);
    if (hash !== row.summaryHash) {
      // Algo mudou desde a prévia (estoque, horário, nome…): mostra a nova versão e pede de novo.
      const updated = await prisma.aiActionProposal.update({
        where: { id: row.id },
        data: {
          status: 'AWAITING_APPROVAL',
          summary: summary as unknown as Prisma.InputJsonValue,
          summaryHash: hash,
          decidedAt: null,
          expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
        },
      });
      return { status: 'CHANGED', proposal: toProposal(updated) };
    }
    const effects = await executeAction(ctx, action);
    await prisma.aiActionProposal.update({
      where: { id: row.id },
      data: {
        status: 'COMPLETED',
        resultMessage: effects.message,
        executedAt: new Date(),
        ...(SENSITIVE_KINDS.has(action.kind)
          ? {
              payload: { kind: action.kind, redacted: true },
              summary: REDACTED_SUMMARY(summary.title),
            }
          : {}),
      },
    });
    await recordAuditLog({
      companyId: session.companyId,
      entityType: 'AiActionProposal',
      entityId: row.id,
      action: 'status_changed',
      userId: session.userId,
      metadata: {
        kind: action.kind,
        status: 'COMPLETED',
        source: row.origin,
        requestedBy: row.userId,
        approvedBy: session.userId,
      },
    });
    return {
      status: 'COMPLETED',
      message: effects.message,
      link: effects.link,
      alreadyDone: false,
      effects,
    };
  } catch (error) {
    const message = error instanceof UserError ? error.message : 'Erro inesperado ao executar.';
    await prisma.aiActionProposal.update({
      where: { id: row.id },
      data: {
        status: 'FAILED',
        errorMessage: message,
        ...(SENSITIVE_KINDS.has(row.kind as AssistantAction['kind'])
          ? {
              payload: { kind: row.kind, redacted: true },
              summary: REDACTED_SUMMARY((row.summary as Summary).title),
            }
          : {}),
      },
    });
    throw error;
  }
}

async function expire(id: string, kind: string) {
  await prisma.aiActionProposal.updateMany({
    where: { id, status: 'AWAITING_APPROVAL' },
    data: {
      status: 'EXPIRED',
      ...(SENSITIVE_KINDS.has(kind as AssistantAction['kind'])
        ? { payload: { kind, redacted: true } }
        : {}),
    },
  });
}

export async function cancelProposal(session: AiSession, proposalId: string) {
  const row = await prisma.aiActionProposal.findFirst({
    where: { id: proposalId, companyId: session.companyId, userId: session.userId },
  });
  if (!row) throw new UserError('Proposta não encontrada.');
  const result = await prisma.aiActionProposal.updateMany({
    where: { id: proposalId, status: 'AWAITING_APPROVAL' },
    data: {
      status: 'CANCELED',
      decidedAt: new Date(),
      decidedByUserId: session.userId,
      ...(SENSITIVE_KINDS.has(row.kind as AssistantAction['kind'])
        ? {
            payload: { kind: row.kind, redacted: true },
            summary: REDACTED_SUMMARY((row.summary as Summary).title),
          }
        : {}),
    },
  });
  if (result.count === 0) throw new UserError('Esta proposta não está mais aguardando aprovação.');
}

/** Estado atual de propostas (para a tela atualizar cartões depois de recarregar). */
export async function getProposals(session: AiSession, ids: string[]) {
  const rows = await prisma.aiActionProposal.findMany({
    where: { id: { in: ids.slice(0, 50) }, companyId: session.companyId, userId: session.userId },
  });
  const now = Date.now();
  return rows.map((row) =>
    toProposal(
      row.status === 'AWAITING_APPROVAL' && row.expiresAt.getTime() < now
        ? { ...row, status: 'EXPIRED' }
        : row,
    ),
  );
}

// ---- Central de aprovações ---------------------------------------------------------------------

/**
 * Recusa (administrador ou quem pediu). Fica registrada com quem decidiu e o motivo. Recusar não
 * desfaz nada porque nada foi executado.
 */
export async function rejectProposal(session: AiSession, proposalId: string, note?: string | null) {
  const owner = session.isAdmin ? {} : { userId: session.userId };
  const row = await prisma.aiActionProposal.findFirst({
    where: { id: proposalId, companyId: session.companyId, ...owner },
  });
  if (!row) throw new UserError('Proposta não encontrada.');
  const result = await prisma.aiActionProposal.updateMany({
    where: { id: proposalId, status: 'AWAITING_APPROVAL' },
    data: {
      status: 'REJECTED',
      decidedAt: new Date(),
      decidedByUserId: session.userId,
      decisionNote: note?.trim().slice(0, 500) || null,
      ...(SENSITIVE_KINDS.has(row.kind as AssistantAction['kind'])
        ? {
            payload: { kind: row.kind, redacted: true },
            summary: REDACTED_SUMMARY((row.summary as Summary).title),
          }
        : {}),
    },
  });
  if (result.count === 0) throw new UserError('Esta proposta não está mais aguardando aprovação.');
  await recordAuditLog({
    companyId: session.companyId,
    entityType: 'AiActionProposal',
    entityId: proposalId,
    action: 'rejected',
    userId: session.userId,
    metadata: { kind: row.kind, requestedBy: row.userId },
  });
}

export type ApprovalItem = {
  id: string;
  kind: string;
  origin: string;
  requestedBy: string;
  mine: boolean;
  title: string;
  details: { label: string; value: string }[];
  status: string;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  resultMessage: string | null;
  errorMessage: string | null;
};

/**
 * Propostas para a Central: administradores veem as de toda a empresa; a equipe, as próprias.
 * Pendentes vencidas aparecem como expiradas (e são marcadas no banco).
 */
export async function listApprovals(
  session: AiSession,
  filter: { pending?: boolean; limit?: number } = {},
): Promise<ApprovalItem[]> {
  const owner = session.isAdmin ? {} : { userId: session.userId };
  const stale = await prisma.aiActionProposal.findMany({
    where: {
      companyId: session.companyId,
      ...owner,
      status: 'AWAITING_APPROVAL',
      expiresAt: { lt: new Date() },
    },
    select: { id: true, kind: true },
    take: 100,
  });
  for (const row of stale) await expire(row.id, row.kind);
  const rows = await prisma.aiActionProposal.findMany({
    where: {
      companyId: session.companyId,
      ...owner,
      ...(filter.pending ? { status: 'AWAITING_APPROVAL' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filter.limit ?? 50, 100),
  });
  return rows.map((row) => {
    const summary = row.summary as Summary;
    return {
      id: row.id,
      kind: row.kind,
      origin: row.origin,
      requestedBy: row.userId,
      mine: row.userId === session.userId,
      title: summary.title,
      details: summary.details,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decidedBy: row.decidedByUserId,
      decisionNote: row.decisionNote,
      resultMessage: row.resultMessage,
      errorMessage: row.errorMessage,
    };
  });
}

export async function countPendingApprovals(companyId: string, userId: string, isAdmin: boolean) {
  return prisma.aiActionProposal.count({
    where: {
      companyId,
      ...(isAdmin ? {} : { userId }),
      status: 'AWAITING_APPROVAL',
      expiresAt: { gt: new Date() },
    },
  });
}
