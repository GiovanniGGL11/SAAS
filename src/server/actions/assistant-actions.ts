'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assistantMessagesSchema } from '@/lib/assistant';
import { toActionResult } from '@/server/action-result';
import { isCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { requireFormAccess } from '@/server/auth/form-access';
import { getOwnProfessional } from '@/server/auth/professional-scope';
import { rateLimitByKey } from '@/server/rate-limit';
import {
  AiAccessError,
  aiAccessSummary,
  assertAiCapability,
  buildAiSession,
} from '@/server/ai/access';
import { handleAssistantMessage } from '@/server/ai/assistant-service';
import { aiDemoState, askAiDemo } from '@/server/ai/demo';
import {
  cancelProposal,
  confirmProposal,
  countPendingApprovals,
  getProposals,
  listApprovals,
  rejectProposal,
} from '@/server/ai/proposals';
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

/*
  Login do profissional vê só a própria agenda e os próprios clientes; as ferramentas do assistente
  enxergam a empresa toda. Até elas respeitarem esse recorte, o assistente fica fora para ele.
*/
const PROFESSIONAL_BLOCK_MESSAGE =
  'O assistente ainda não está disponível no login do profissional. Peça à recepção ou ao administrador.';

async function assertNotOwnProfessional() {
  if (await getOwnProfessional())
    throw new AiAccessError('not_allowed', PROFESSIONAL_BLOCK_MESSAGE);
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
    await assertNotOwnProfessional();
    const reply = await handleAssistantMessage({
      session,
      messages,
      formAccess: await formAccessOrUndefined(),
    });
    // Créditos gastos nesta resposta (consultas ao modelo), para a pessoa acompanhar.
    return { reply: reply.reply, proposals: reply.proposals, credits: reply.calls };
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
    await assertNotOwnProfessional();
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
  if (await getOwnProfessional()) {
    summary.assistant = false;
    summary.assistantMessage = PROFESSIONAL_BLOCK_MESSAGE;
  }
  const usage = summary.includedInPlan
    ? await getUsageSummary(
        session.companyId,
        session.timezone,
        session.entitlements.ai.monthlyUnits,
      )
    : null;
  return {
    ...summary,
    isAdmin: session.isAdmin,
    usage,
    /** Administrador que ainda não está no plano com mais créditos. */
    canUpgradeCredits: session.isAdmin && session.entitlements.planId !== 'pro',
    /** Plano sem IA: poucas perguntas de demonstração (uma vez só). */
    demo: await aiDemoState(session),
  };
}

/** Uma pergunta da demonstração da IA (plano sem IA). Só consulta, resposta curta. */
export async function askAssistantDemoAction(input: unknown) {
  return toActionResult(async () => {
    const { question } = z.object({ question: z.string().max(1000) }).parse(input);
    const session = await aiSession();
    return askAiDemo({ session, question });
  });
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

// ---- Central de aprovações ---------------------------------------------------------------------

/** Nome de quem pediu/decidiu (do Clerk). Falhar aqui não impede a lista. */
async function userNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id) => id.startsWith('user_')))].slice(0, 100);
  if (!unique.length) return {};
  try {
    const { clerkClient } = await import('@clerk/nextjs/server');
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ userId: unique, limit: unique.length });
    return Object.fromEntries(
      data.map((u) => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(' ') ||
          u.emailAddresses[0]?.emailAddress ||
          'Pessoa da equipe',
      ]),
    );
  } catch {
    return {};
  }
}

export async function listApprovalsAction(input: unknown) {
  return toActionResult(async () => {
    const { pending } = z.object({ pending: z.boolean().optional() }).parse(input ?? {});
    const session = await aiSession();
    const items = await listApprovals(session, { pending });
    const names = await userNames(items.flatMap((i) => [i.requestedBy, i.decidedBy ?? '']));
    return {
      isAdmin: session.isAdmin,
      items: items.map((i) => ({
        ...i,
        requestedByName: i.mine ? 'Você' : (names[i.requestedBy] ?? 'Pessoa da equipe'),
        decidedByName: i.decidedBy
          ? i.decidedBy === session.userId
            ? 'Você'
            : (names[i.decidedBy] ?? 'Pessoa da equipe')
          : null,
      })),
    };
  });
}

export async function rejectProposalAction(input: unknown) {
  return toActionResult(async () => {
    const { proposalId, note } = z
      .object({ proposalId: z.string().min(1).max(64), note: z.string().max(500).nullish() })
      .parse(input);
    const session = await aiSession();
    await rejectProposal(session, proposalId, note);
  });
}

export async function countPendingApprovalsAction() {
  const session = await requireCurrentCompany();
  return countPendingApprovals(session.company.id, session.userId, isCompanyAdmin(session));
}
