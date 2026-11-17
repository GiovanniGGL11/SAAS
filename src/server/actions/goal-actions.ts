'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { GOAL_METRIC_KEYS, type GoalMetric } from '@/server/data/period-goals';
import { setCompanyGoal, setProfessionalGoals, setShareGoalsWithTeam } from '@/server/data/goals';
import { setRevenueGoal } from '@/server/data/insights';

/** Metas: só o dono/gerente define. */

const amount = z.number().positive('A meta precisa ser maior que zero.').max(99_999_999).nullable();

export async function setCompanyGoalAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ metric: z.enum(GOAL_METRIC_KEYS as [GoalMetric, ...GoalMetric[]]), target: amount })
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    await setCompanyGoal(company, parsed.metric, parsed.target, userId);
    // A meta de recebido também é a meta do mês do Início: as duas andam juntas.
    if (parsed.metric === 'received') await setRevenueGoal(company.clerkOrgId, parsed.target);
    revalidatePath('/metas');
    revalidatePath('/dashboard');
  });
}

export async function setProfessionalGoalsAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        professionalId: z.string().min(1).max(64),
        revenue: amount,
        appointments: z.number().int().positive().max(100_000).nullable(),
      })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    await setProfessionalGoals(company.id, parsed.professionalId, parsed);
    revalidatePath('/metas');
  });
}

export async function setShareGoalsAction(input: unknown) {
  return toActionResult(async () => {
    const { share } = z.object({ share: z.boolean() }).parse(input);
    const { company } = await requireCompanyAdmin();
    await setShareGoalsWithTeam(company.id, share);
    revalidatePath('/metas');
  });
}
