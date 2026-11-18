import { prisma } from '@/lib/db';
import {
  AI_DEMO_MAX_CHARS,
  AI_DEMO_MAX_STEPS,
  AI_DEMO_QUESTIONS,
  AI_DEMO_SECONDS,
} from '@/lib/ai-demo';
import { UserError } from '@/server/errors';
import { rateLimitByKey } from '@/server/rate-limit';
import { AiAccessError, type AiSession } from '@/server/ai/access';
import { emptyUsage, recordUsageEvent } from '@/server/ai/usage';
import { GeminiError, getGeminiConfig } from '@/server/assistant/gemini';
import { runAssistant, type AssistantReply } from '@/server/assistant/run';
import { getPreferences, languagePreferencesForPrompt } from '@/server/data/business-preferences';

/*
  Demonstração curta do assistente (ver src/lib/ai-demo.ts). Só para o dono/administrador de um
  plano que não inclui IA ("not_in_plan"): atraso de pagamento ou IA pausada não abre demonstração.
  Cada pergunta gasta uma das poucas da empresa ANTES de chamar o provedor (contador conferido no
  próprio UPDATE, então dois cliques não passam do limite); se o provedor falhar, devolve.
*/

export function aiDemoEligible(session: AiSession): boolean {
  const { ai } = session.entitlements;
  return (
    session.isAdmin &&
    !ai.available.assistant &&
    ai.reasons.assistant === 'not_in_plan' &&
    getGeminiConfig() !== null
  );
}

export async function aiDemoState(session: AiSession) {
  if (!aiDemoEligible(session)) return null;
  const company = await prisma.company.findUnique({
    where: { id: session.companyId },
    select: { aiDemoUsed: true },
  });
  const used = Math.min(company?.aiDemoUsed ?? 0, AI_DEMO_QUESTIONS);
  return { total: AI_DEMO_QUESTIONS, used, remaining: AI_DEMO_QUESTIONS - used };
}

export async function askAiDemo(params: {
  session: AiSession;
  question: string;
  /** Para testes: troca a execução do modelo. */
  run?: typeof runAssistant;
}): Promise<{ reply: string; remaining: number }> {
  const { session } = params;
  if (!aiDemoEligible(session)) {
    throw new AiAccessError(
      session.entitlements.ai.reasons.assistant ?? 'not_in_plan',
      session.isAdmin ? undefined : 'A demonstração da IA é para o dono ou administrador.',
    );
  }
  const question = params.question.trim();
  if (!question) throw new UserError('Escreva uma pergunta.');
  if (question.length > AI_DEMO_MAX_CHARS) {
    throw new UserError(
      `Na demonstração, faça uma pergunta direta, de até ${AI_DEMO_MAX_CHARS} letras.`,
    );
  }
  const config = getGeminiConfig();
  if (!config) throw new AiAccessError('provider_not_configured');
  rateLimitByKey(`assistant-demo:${session.companyId}`, 3, 60_000);

  // Gasta uma pergunta antes de chamar o provedor (só se ainda houver).
  const spent = await prisma.company.updateMany({
    where: { id: session.companyId, aiDemoUsed: { lt: AI_DEMO_QUESTIONS } },
    data: { aiDemoUsed: { increment: 1 } },
  });
  if (spent.count === 0) {
    throw new UserError(
      `Você já usou as ${AI_DEMO_QUESTIONS} perguntas de demonstração. O assistente completo está nos planos Profissional e Pro.`,
    );
  }

  const run = params.run ?? runAssistant;
  let reply: AssistantReply | null = null;
  try {
    reply = await run({
      ctx: {
        companyId: session.companyId,
        companyName: session.companyName,
        timezone: session.timezone,
        userId: session.userId,
        isAdmin: session.isAdmin,
        languagePreferences: languagePreferencesForPrompt(await getPreferences(session.companyId)),
      },
      ...config,
      // Uma pergunta só, sem histórico: resposta curta e barata.
      messages: [{ role: 'user', text: question }],
      // Só consulta: a demonstração nunca prepara nem faz alterações.
      mode: 'SUGGEST',
      maxSteps: AI_DEMO_MAX_STEPS,
      deadlineMs: AI_DEMO_SECONDS * 1000,
    });
  } catch (error) {
    // Falhou antes de responder: a pergunta volta para a pessoa.
    await prisma.company
      .updateMany({
        where: { id: session.companyId, aiDemoUsed: { gt: 0 } },
        data: { aiDemoUsed: { decrement: 1 } },
      })
      .catch(() => undefined);
    if (error instanceof GeminiError) throw new UserError(error.message);
    throw error;
  } finally {
    const calls = reply?.calls ?? 1;
    await recordUsageEvent({
      companyId: session.companyId,
      userId: session.userId,
      feature: 'assistant_demo',
      provider: 'gemini',
      model: config.model,
      usage: reply?.usage ?? emptyUsage(),
      calls,
      units: calls,
      outcome: reply ? 'SUCCEEDED' : 'FAILED',
    }).catch((e) => console.error('[ai] falha ao medir consumo da demonstração', e));
  }

  const after = await aiDemoState(session);
  return { reply: reply.reply, remaining: after?.remaining ?? 0 };
}
