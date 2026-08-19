'use server';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
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
  const { company } = await requireCurrentCompany();
  const range = resolveReportRange(parsed.preset, company.timezone);

  const [byProfessional, byService, byWeekday, cancellation] = await Promise.all([
    getRevenueByProfessional(company.id, range),
    getRevenueByService(company.id, range),
    getRevenueByWeekday(company.id, range, company.timezone),
    getCancellationStats(company.id, range),
  ]);

  return { byProfessional, byService, byWeekday, cancellation };
}
