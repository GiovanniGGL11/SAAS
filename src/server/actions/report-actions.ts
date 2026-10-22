'use server';

import { z } from 'zod';

import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { toActionResult } from '@/server/action-result';
import { assertFeature } from '@/server/billing/features';
import { listServiceMargins } from '@/server/data/service-margins';
import { getAdvancedKpis } from '@/server/data/kpis';
import {
  GOAL_METRIC_KEYS,
  copyPeriodGoals,
  currentMonth,
  getPeriodGoals,
  setPeriodGoal,
  shiftMonth,
} from '@/server/data/period-goals';
import { reportPresetInput } from '@/lib/validations/report';
import { resolveReportRange } from '@/lib/report-range';
import {
  getCancellationStats,
  getRevenueByProfessional,
  getRevenueByService,
  getRevenueByWeekday,
} from '@/server/data/reports';

export async function getReportAction(input: unknown) {
  const parsed = reportPresetInput.parse(input);
  const { company } = await requireCompanyAdmin();
  const range = resolveReportRange(parsed.preset, company.timezone);

  const [byProfessional, byService, byWeekday, cancellation] = await Promise.all([
    getRevenueByProfessional(company.id, range),
    getRevenueByService(company.id, range),
    getRevenueByWeekday(company.id, range, company.timezone),
    getCancellationStats(company.id, range),
  ]);

  return { byProfessional, byService, byWeekday, cancellation };
}

/** Margem de contribuição por serviço (plano Pro). */
export async function getServiceMarginsAction() {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    assertFeature(company, 'contributionMargin');
    return listServiceMargins(company.id);
  });
}

/** Indicadores avançados (plano Pro). */
export async function getAdvancedKpisAction(input: unknown) {
  return toActionResult(async () => {
    const { days } = z.object({ days: z.number().int().min(7).max(365) }).parse(input);
    const { company } = await requireCompanyAdmin();
    assertFeature(company, 'advancedKpis');
    return getAdvancedKpis(company.id, days);
  });
}

const monthInput = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.');

/** Metas por período (Pro): o mês pedido, ou o mês atual no fuso da empresa. */
export async function getPeriodGoalsAction(input: unknown) {
  return toActionResult(async () => {
    const { month } = z.object({ month: monthInput.optional() }).parse(input);
    const { company } = await requireCompanyAdmin();
    assertFeature(company, 'advancedKpis');
    return getPeriodGoals(company.id, company.timezone, month ?? currentMonth(company.timezone));
  });
}

export async function setPeriodGoalAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        metric: z.enum(GOAL_METRIC_KEYS as [string, ...string[]]),
        month: monthInput,
        target: z.number().positive('A meta precisa ser maior que zero.').max(1e10).nullable(),
      })
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    assertFeature(company, 'advancedKpis');
    await setPeriodGoal(company.id, userId, {
      ...parsed,
      metric: parsed.metric as (typeof GOAL_METRIC_KEYS)[number],
    });
  });
}

/** Copia as metas do mês anterior para este (as que já existem aqui ficam como estão). */
export async function copyPreviousGoalsAction(input: unknown) {
  return toActionResult(async () => {
    const { month } = z.object({ month: monthInput }).parse(input);
    const { company, userId } = await requireCompanyAdmin();
    assertFeature(company, 'advancedKpis');
    return copyPeriodGoals(company.id, userId, shiftMonth(month, -1), month);
  });
}
