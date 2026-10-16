/**
 * Cliente mínimo da API REST do Gemini (generateContent com function calling).
 *
 * `fetch` direto em vez do SDK: são duas chamadas e o formato é estável; assim os testes trocam o
 * Gemini por um falso com `vi.stubGlobal('fetch', ...)`, como no Google Calendar.
 */

import type { ProviderUsage } from '@/server/ai/usage';

// Alias mantido pelo Google que aponta sempre para o Flash estável mais novo (barato e rápido).
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiFunctionCall = { id?: string; name: string; args?: Record<string, unknown> };

export type GeminiPart = {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  // Os modelos novos devolvem uma assinatura do raciocínio que precisa voltar intacta no turno
  // seguinte; por isso o conteúdo do modelo é reenviado como veio.
  thoughtSignature?: string;
  thought?: boolean;
};

export type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

export type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
};

export type GeminiResult = { content: GeminiContent; usage: ProviderUsage };

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiError';
  }
}

export function getGeminiConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL };
}

export async function generateContent(params: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: GeminiContent[];
  functionDeclarations: GeminiFunctionDeclaration[];
  /** Tempo máximo desta chamada (o pedido inteiro tem um teto próprio). */
  timeoutMs?: number;
}): Promise<GeminiResult> {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(params.model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': params.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.systemInstruction }] },
      contents: params.contents,
      tools: [{ functionDeclarations: params.functionDeclarations }],
      generationConfig: { temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(params.timeoutMs ?? 45_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[assistant] Gemini respondeu', response.status, body.slice(0, 500));
    throw new GeminiError(
      response.status === 429
        ? 'O assistente está sobrecarregado agora. Tente de novo em instantes.'
        : 'Não consegui falar com o assistente agora. Tente de novo.',
    );
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
      cachedContentTokenCount?: number;
    };
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const usage = data.usageMetadata ?? {};
  return {
    content: { role: 'model', parts },
    usage: {
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
      other: {
        ...(usage.thoughtsTokenCount ? { thoughtsTokens: usage.thoughtsTokenCount } : {}),
        ...(usage.cachedContentTokenCount ? { cachedTokens: usage.cachedContentTokenCount } : {}),
      },
    },
  };
}
