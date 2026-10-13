'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assistantActionSchema, assistantMessagesSchema } from '@/lib/assistant';
import { toActionResult } from '@/server/action-result';
import { isCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { UserError } from '@/server/errors';
import { rateLimitByKey } from '@/server/rate-limit';
import { GeminiError, getGeminiConfig } from '@/server/assistant/gemini';
import { runAssistant } from '@/server/assistant/run';
import { executeAction } from '@/server/assistant/execute';
import { scheduleGoogleSync } from '@/server/google/background';
import type { AssistantContext } from '@/server/assistant/tools';

async function assistantContext(): Promise<AssistantContext> {
  const session = await requireCurrentCompany();
  return {
    companyId: session.company.id,
    companyName: session.company.name,
    timezone: session.company.timezone,
    userId: session.userId,
    isAdmin: isCompanyAdmin(session),
  };
}

export async function sendAssistantMessageAction(input: unknown) {
  return toActionResult(async () => {
    const { messages } = z.object({ messages: assistantMessagesSchema }).parse(input);
    if (messages.at(-1)?.role !== 'user') throw new UserError('Escreva uma mensagem.');
    const ctx = await assistantContext();
    const config = getGeminiConfig();
    if (!config) throw new UserError('Assistente não configurado.');
    // Cada mensagem custa chamadas pagas ao Gemini: limite por pessoa, não por IP.
    rateLimitByKey(`assistant:${ctx.userId}`, 12, 60_000);
    try {
      return await runAssistant({ ctx, ...config, messages });
    } catch (error) {
      if (error instanceof GeminiError) throw new UserError(error.message);
      throw error;
    }
  });
}

/**
 * O "Confirmar" do cartão. A ação vem do navegador, então é tratada como qualquer entrada: validada
 * de novo, conferida contra a empresa da sessão e executada pelas mesmas funções das telas.
 */
export async function confirmAssistantActionAction(input: unknown) {
  return toActionResult(async () => {
    const action = assistantActionSchema.parse(input);
    const ctx = await assistantContext();
    rateLimitByKey(`assistant-confirm:${ctx.userId}`, 30, 60_000);
    const result = await executeAction(ctx, action);
    scheduleGoogleSync(ctx.companyId, result.appointmentIds);
    for (const path of result.paths) revalidatePath(path);
    return { message: result.message };
  });
}
