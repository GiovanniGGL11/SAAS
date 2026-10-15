'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { rateLimit } from '@/server/rate-limit';
import { savePublicDraft, submitPublicForm } from '@/server/data/forms';

/*
  Ações do link público de preenchimento (sem login). O token é a única credencial: vale para
  uma ficha, expira, pode ser revogado e só aceita um envio. Limite de tentativas por IP.
*/

const tokenInput = z.string().min(30).max(100);
const answersInput = z
  .record(z.string().max(60), z.unknown())
  .refine((a) => JSON.stringify(a).length <= 200_000, 'Respostas grandes demais.');

export async function savePublicFormDraftAction(input: unknown) {
  return toActionResult(async () => {
    await rateLimit('form-draft', 60, 60_000);
    const parsed = z.object({ token: tokenInput, answers: answersInput }).parse(input);
    await savePublicDraft(parsed.token, parsed.answers);
    return { savedAt: new Date().toISOString() };
  });
}

export async function submitPublicFormAction(input: unknown) {
  return toActionResult(async () => {
    await rateLimit('form-submit', 10, 60_000);
    const parsed = z.object({ token: tokenInput, answers: answersInput }).parse(input);
    return submitPublicForm(parsed.token, parsed.answers);
  });
}
