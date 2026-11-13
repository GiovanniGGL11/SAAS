'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { clerkClient } from '@clerk/nextjs/server';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { rateLimitByKey } from '@/server/rate-limit';
import { claimTrial } from '@/server/billing/trial-claim';

/** Libera o 1º mês grátis da empresa, conferindo se a pessoa já usou o teste antes. */
export async function claimTrialAction(input: unknown) {
  return toActionResult(async () => {
    const { document, phone } = z
      .object({ document: z.string().max(30), phone: z.string().max(30) })
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    // Segura quem tenta CPFs/celulares em sequência até achar um que passe.
    rateLimitByKey(`trial-claim:${userId}`, 5, 60 * 60_000);

    const user = await (await clerkClient()).users.getUser(userId);
    const emails = user.emailAddresses
      .filter((e) => e.verification?.status === 'verified')
      .map((e) => e.emailAddress);
    const h = await headers();
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || null;

    const result = await claimTrial({ companyId: company.id, userId, emails, document, phone, ip });
    revalidatePath('/', 'layout');
    return result;
  });
}
