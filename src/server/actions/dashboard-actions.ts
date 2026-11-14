'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { setRevenueGoal } from '@/server/data/insights';
import { getDashboardPeriod } from '@/server/data/dashboard-period';
import { reportPresetInput } from '@/lib/validations/report';

/** Números do período escolhido no Início (só o dono vê). */
export async function getDashboardPeriodAction(preset: unknown) {
  const parsed = reportPresetInput.parse({ preset });
  const { company } = await requireCompanyAdmin();
  return getDashboardPeriod(company.id, company.timezone, parsed.preset);
}

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
