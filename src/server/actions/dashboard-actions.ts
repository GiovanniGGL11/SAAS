'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { setRevenueGoal } from '@/server/data/insights';

export async function setRevenueGoalAction(input: unknown) {
  return toActionResult(async () => {
    const { goal } = z
      .object({
        goal: z.number().positive('A meta precisa ser maior que zero.').max(99_999_999).nullable(),
      })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    await setRevenueGoal(company.clerkOrgId, goal);
    revalidatePath('/dashboard');
  });
}
