'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assistantMessagesSchema } from '@/lib/assistant';
import { toActionResult } from '@/server/action-result';
import { isCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { requireFormAccess } from '@/server/auth/form-access';
import { rateLimitByKey } from '@/server/rate-limit';
import {
  AiAccessError,
  aiAccessSummary,
  assertAiCapability,
  buildAiSession,
} from '@/server/ai/access';
import { handleAssistantMessage } from '@/server/ai/assistant-service';
import { cancelProposal, confirmProposal, getProposals } from '@/server/ai/proposals';
import { getUsageSummary } from '@/server/ai/quota';
import { listAuthorizations, setAuthorizationStatus, setAutonomyMode } from '@/server/ai/autonomy';
import { listAddOnStates } from '@/server/ai/addons';
import { scheduleGoogleSync } from '@/server/google/background';

/** Sessão de IA a partir da sessão do servidor (empresa nunca vem do navegador). */
async function aiSession() {
  const session = await requireCurrentCompany();
  return buildAiSession({
    company: session.company,
    userId: session.userId,
    isAdmin: isCompanyAdmin(session),
  });
}

/** Permissões de fichas só quando dá para carregar (a IA respeita as mesmas regras da tela). */
async function formAccessOrUndefined() {
  try {
    return (await requireFormAccess()).access;
  } catch {
    return undefined;
  }
}

export async function sendAssistantMessageAction(input: unknown) {
  return toActionResult(async () => {
    const { messages } = z.object({ messages: assistantMessagesSchema }).parse(input);
    const session = await aiSession();
    // Bloqueio antes de qualquer outra coisa: plano sem IA não chega ao provedor.
    assertAiCapability(session, 'assistant');
    const reply = await handleAssistantMessage({
      session,
      messages,
      formAccess: await formAccessOrUndefined(),
    });
    return { reply: reply.reply, proposals: reply.proposals };
  });
}

/**
 * O "Confirmar" do cartão: só o id da proposta guardada no servidor. Executa uma vez; se algo
 * mudou desde a prévia, devolve a versão nova para aprovar de novo.
 */
export async function confirmAssistantActionAction(input: unknown) {
  return toActionResult(async () => {
    const { proposalId } = z.object({ proposalId: z.string().min(1).max(64) }).parse(input);
    const session = await aiSession();
    rateLimitByKey(`assistant-confirm:${session.userId}`, 30, 60_000);
    const outcome = await confirmProposal(session, proposalId, await formAccessOrUndefined());
    if (outcome.status === 'COMPLETED' && outcome.effects) {
      scheduleGoogleSync(session.companyId, outcome.effects.appointmentIds);
      for (const path of outcome.effects.paths) revalidatePath(path);
    }
    return outcome.status === 'COMPLETED'
      ? { status: 'COMPLETED' as const, message: outcome.message, link: outcome.link ?? null }
      : { status: 'CHANGED' as const, proposal: outcome.proposal };
  });
}

export async function cancelAssistantProposalAction(input: unknown) {
  return toActionResult(async () => {
    const { proposalId } = z.object({ proposalId: z.string().min(1).max(64) }).parse(input);
    await cancelProposal(await aiSession(), proposalId);
  });
}

export async function getAssistantProposalsAction(input: unknown) {
  const { ids } = z.object({ ids: z.array(z.string().min(1).max(64)).max(50) }).parse(input);
  return getProposals(await aiSession(), ids);
}

/** Estado da IA para a tela: o mesmo cálculo que o servidor usa para bloquear. */
export async function getAiStatusAction() {
  const session = await aiSession();
  const summary = aiAccessSummary(session);
  const usage = summary.includedInPlan
    ? await getUsageSummary(
        session.companyId,
        session.timezone,
        session.entitlements.ai.monthlyUnits,
      )
    : null;
  return { ...summary, isAdmin: session.isAdmin, usage };
}

export async function getAiSettingsAction() {
  return toActionResult(async () => {
    const session = await aiSession();
    if (!session.isAdmin) throw new AiAccessError('not_allowed');
    return {
      status: aiAccessSummary(session),
      authorizations: await listAuthorizations(session),
      addOns: await listAddOnStates(session),
    };
  });
}

export async function setAutonomyModeAction(input: unknown) {
  return toActionResult(async () => {
    const { mode } = z.object({ mode: z.enum(['SUGGEST', 'APPROVAL', 'AUTO_RULES']) }).parse(input);
    await setAutonomyMode(await aiSession(), mode);
    revalidatePath('/configuracoes');
  });
}

export async function setAuthorizationStatusAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ id: z.string().min(1).max(64), status: z.enum(['ACTIVE', 'PAUSED', 'REVOKED']) })
      .parse(input);
    await setAuthorizationStatus(await aiSession(), parsed.id, parsed.status);
  });
}

/**
 * Comando de voz. A gravação e a transcrição ainda não existem: o acesso é conferido e o pedido
 * recusado ANTES de ler o áudio ou chamar qualquer provedor.
 */
export async function processVoiceCommandAction(formData: FormData) {
  return toActionResult(async () => {
    const session = await aiSession();
    assertAiCapability(session, 'voice');
    // Inalcançável enquanto AI_IMPLEMENTED.voice for falso.
    void formData;
    throw new AiAccessError('not_implemented');
  });
}
