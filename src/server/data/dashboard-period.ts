import { resolveReportRange } from '@/lib/report-range';
import type { ReportPreset } from '@/lib/validations/report';
import { getPeriodInsights, getRevenueByDayInRange } from '@/server/data/insights';
import { getReviewSummary } from '@/server/data/relationship';

/**
 * Só o que muda com o período do Início ("Como o negócio está indo" e o desempenho da equipe).
 * Trocar o período busca apenas isto, sem recarregar o resto da página.
 */
export async function getDashboardPeriod(
  companyId: string,
  timezone: string,
  preset: ReportPreset,
) {
  const range = resolveReportRange(preset, timezone);
  const [insights, revenueByDay, reviews] = await Promise.all([
    getPeriodInsights(companyId, timezone, range),
    getRevenueByDayInRange(companyId, timezone, range),
    getReviewSummary(companyId, range),
  ]);
  return {
    preset,
    insights,
    revenueByDay,
    reviews: {
      average: reviews.average,
      count: reviews.count,
      byProfessional: reviews.byProfessional,
    },
  };
}

export type DashboardPeriodData = Awaited<ReturnType<typeof getDashboardPeriod>>;
