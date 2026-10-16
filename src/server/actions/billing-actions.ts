'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import {
  cancelCompanySubscription,
  pendingInvoiceUrl,
  startSubscription,
} from '@/server/billing/subscription';

const cpfCnpj = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine(
    (v) => v.length === 11 || v.length === 14,
    'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).',
  );

export async function startSubscriptionAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        planId: z.enum(['essencial', 'profissional', 'pro', 'rede']),
        name: z.string().trim().min(2, 'Informe o nome ou a razão social.').max(120),
        cpfCnpj,
        email: z.email('E-mail inválido.'),
        phone: z.string().max(20).optional(),
      })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    const result = await startSubscription(company, parsed);
    revalidatePath('/assinatura');
    return result;
  });
}

export async function getInvoiceUrlAction() {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    return { url: await pendingInvoiceUrl(company) };
  });
}

export async function cancelSubscriptionAction() {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    await cancelCompanySubscription(company);
    revalidatePath('/assinatura');
  });
}
