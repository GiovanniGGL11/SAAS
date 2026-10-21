'use server';

import { z } from 'zod';

import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { toActionResult } from '@/server/action-result';
import { assertFeature } from '@/server/billing/features';
import { listServiceMargins } from '@/server/data/service-margins';
import { getAdvancedKpis } from '@/server/data/kpis';
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
