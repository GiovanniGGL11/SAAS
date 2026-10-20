'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { isCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { featureAccessFor } from '@/server/billing/features';
import { getMyDay } from '@/server/data/my-day';

/** "Meu dia" — funciona em todos os planos e sem IA; cada módulo entra só se o plano incluir. */
export async function getMyDayAction(input: unknown) {
  return toActionResult(async () => {
    const options = z
      .object({
        owner: z.string().max(64).optional(),
        days: z.number().int().min(1).max(14).optional(),
      })
      .parse(input ?? {});
    const session = await requireCurrentCompany();
    const { features } = featureAccessFor(session.company);
    return getMyDay(
      session.company.id,
      session.company.timezone,
      { userId: session.userId, isAdmin: isCompanyAdmin(session), features },
      options,
    );
  });
}
