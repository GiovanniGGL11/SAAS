import type { AssistantChatMessage } from '@/lib/assistant';
import { getPreferences, languagePreferencesForPrompt } from '@/server/data/business-preferences';
import { UserError } from '@/server/errors';
import { rateLimitByKey } from '@/server/rate-limit';
import { AiAccessError, assertAiCapability, type AiSession } from '@/server/ai/access';
import { reserveUnits, settleReservation } from '@/server/ai/quota';
import { emptyUsage, recordUsageEvent } from '@/server/ai/usage';
import { GeminiError, getGeminiConfig } from '@/server/assistant/gemini';
import { runAssistant, type AssistantReply } from '@/server/assistant/run';
import type { AssistantContext } from '@/server/assistant/tools';

/*
  Um pedido ao assistente, de ponta a ponta. A ordem importa:
  1. acesso (plano, pagamento, implementado, franquia definida) — antes de montar qualquer dado;
  2. provedor configurado e limite por pessoa;
  3. reserva da franquia (pior caso);
  4. só então o provedor; depois, conciliação com o consumo real e medição (sem conteúdo).
*/

export async function handleAssistantMessage(params: {
  session: AiSession;
  messages: AssistantChatMessage[];
  formAccess?: AssistantContext['formAccess'];
  /** Para testes: troca a execução do modelo. */
  run?: typeof runAssistant;
}): Promise<AssistantReply> {
  const { session } = params;
  assertAiCapability(session, 'assistant');
  const config = getGeminiConfig();
  if (!config) throw new AiAccessError('provider_not_configured');
  if (params.messages.at(-1)?.role !== 'user') throw new UserError('Escreva uma mensagem.');
  rateLimitByKey(`assistant:${session.userId}`, 12, 60_000);

  const maxSteps = session.entitlements.ai.maxStepsPerRequest;
  const reservation = await reserveUnits({
    companyId: session.companyId,
    timezone: session.timezone,
    units: maxSteps,
    limit: session.entitlements.ai.monthlyUnits,
    feature: 'assistant_chat',
  });

  const ctx: AssistantContext = {
    companyId: session.companyId,
    companyName: session.companyName,
    timezone: session.timezone,
    userId: session.userId,
    isAdmin: session.isAdmin,
    formAccess: params.formAccess,
    languagePreferences: languagePreferencesForPrompt(await getPreferences(session.companyId)),
  };
  const run = params.run ?? runAssistant;
  let reply: AssistantReply | null = null;
  try {
    reply = await run({
      ctx,
      ...config,
      messages: params.messages,
      mode: session.autonomy.effective,
      // Nunca passa do que foi reservado nem do teto de tempo do plano.
      maxSteps: reservation.units,
      deadlineMs: session.entitlements.ai.maxRequestSeconds * 1000,
    });
    return reply;
  } catch (error) {
    if (error instanceof GeminiError) throw new UserError(error.message);
    throw error;
  } finally {
    const calls = reply?.calls ?? (reply ? 0 : 1);
    await settleReservation(reservation.id, calls).catch((e) =>
      console.error('[ai] falha ao conciliar reserva', e),
    );
    await recordUsageEvent({
      companyId: session.companyId,
      userId: session.userId,
      feature: 'assistant_chat',
      provider: 'gemini',
      model: config.model,
      usage: reply?.usage ?? emptyUsage(),
      calls,
      units: calls,
      outcome: reply ? 'SUCCEEDED' : 'FAILED',
    }).catch((e) => console.error('[ai] falha ao medir consumo', e));
  }
}
