'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { rateLimit } from '@/server/rate-limit';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { setMarketingOptOut, setOptOutByToken } from '@/server/data/marketing-consent';

/** Página pública: o próprio cliente sai (ou volta) da lista de promoções pelo link da mensagem. */
export async function setOptOutByTokenAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ token: z.string().min(10).max(200), optedOut: z.boolean() })
      .parse(input);
    await rateLimit('marketing-optout', 20, 10 * 60_000);
    return setOptOutByToken(parsed.token, parsed.optedOut);
  });
}

/** Equipe registra o pedido do cliente (ex.: pediu no balcão ou no WhatsApp). */
export async function setClientMarketingOptOutAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ clientId: z.string().min(1).max(64), optedOut: z.boolean() })
      .parse(input);
    const { company, userId } = await requireCurrentCompany();
    await setMarketingOptOut(company.id, parsed.clientId, parsed.optedOut, userId);
    revalidatePath(`/clientes/${parsed.clientId}`);
    return { optedOut: parsed.optedOut };
  });
}
