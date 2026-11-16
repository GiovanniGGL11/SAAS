import { prisma } from '@/lib/db';
import { getTodayInTz } from '@/lib/time';
import { UserError } from '@/server/errors';
import { computeCommissions } from '@/server/data/commissions';
import {
  GOAL_METRICS,
  GOAL_METRIC_KEYS,
  actuals,
  currentMonth,
  monthRange,
  setPeriodGoal,
  type GoalMetric,
} from '@/server/data/period-goals';

/*
  Aba Metas: metas da empresa (recebido, atendimentos, clientes novos, orçamentos) e a meta de
  cada profissional (produção em R$ e atendimentos concluídos), com o realizado do mês.

  A meta da empresa vale a partir do mês em que foi definida e segue valendo nos meses seguintes
  até ser mudada (não precisa digitar de novo todo mês). A do profissional fica no cadastro dele.
*/

export type CompanyGoalView = {
  metric: GoalMetric;
  label: string;
  unit: 'R$' | 'n';
  target: number | null;
  actual: number;
  /** A meta veio de um mês anterior (ainda não foi mudada neste mês). */
  inherited: boolean;
};

export type ProfessionalGoalView = {
  id: string;
  name: string;
  color: string;
  avatarUrl: string | null;
  revenue: { target: number | null; actual: number };
  appointments: { target: number | null; actual: number };
};

export type GoalsOverview = {
  month: string;
  dayOfMonth: number;
  totalDays: number;
  shareWithTeam: boolean;
  company: CompanyGoalView[] | null;
  team: ProfessionalGoalView[];
};

function daysIn(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Metas da empresa vigentes no mês: a definida no mês ou, se não houver, a mais recente antes. */
async function companyTargets(companyId: string, month: string) {
  const rows = await prisma.periodGoal.findMany({
    where: { companyId, month: { lte: month } },
    orderBy: { month: 'desc' },
    select: { metric: true, month: true, target: true },
  });
  const result = new Map<string, { target: number; inherited: boolean }>();
  for (const row of rows) {
    if (result.has(row.metric)) continue;
    result.set(row.metric, { target: Number(row.target), inherited: row.month !== month });
  }
  return result;
}

/** Meta de recebido vigente no mês (para o cartão de meta do Início). */
export async function getCompanyRevenueTarget(companyId: string, timezone: string) {
  const targets = await companyTargets(companyId, currentMonth(timezone));
  return targets.get('received')?.target || null;
}

export async function getGoalsOverview(
  company: { id: string; timezone: string; shareGoalsWithTeam: boolean },
  options: {
    /** Mostrar as metas da empresa (dono, ou equipe quando liberado). */
    includeCompany: boolean;
    /** Só este profissional (login do próprio profissional); null = todos. */
    onlyProfessionalId: string | null;
  },
): Promise<GoalsOverview> {
  const month = currentMonth(company.timezone);
  const range = monthRange(month, company.timezone);
  const professionals = await prisma.professional.findMany({
    where: {
      companyId: company.id,
      active: true,
      ...(options.onlyProfessionalId ? { id: options.onlyProfessionalId } : {}),
    },
    select: {
      id: true,
      name: true,
      color: true,
      avatarUrl: true,
      monthlyGoal: true,
      monthlyAppointmentsGoal: true,
    },
    orderBy: { name: 'asc' },
  });
  const [targets, actual, lines] = await Promise.all([
    options.includeCompany ? companyTargets(company.id, month) : Promise.resolve(null),
    options.includeCompany ? actuals(company.id, range.start, range.end) : Promise.resolve(null),
    professionals.length
      ? computeCommissions(
          company.id,
          { startAt: range.start, endAt: range.end },
          professionals.map((p) => p.id),
        )
      : Promise.resolve([]),
  ]);
  const byPro = new Map(lines.map((l) => [l.professionalId, l]));
  return {
    month,
    dayOfMonth: getTodayInTz(company.timezone).day,
    totalDays: daysIn(month),
    shareWithTeam: company.shareGoalsWithTeam,
    company:
      targets && actual
        ? GOAL_METRIC_KEYS.map((metric) => ({
            metric,
            label: GOAL_METRICS[metric].label,
            unit: GOAL_METRICS[metric].unit as 'R$' | 'n',
            // 0 = "sem meta a partir deste mês" (interrompe a meta herdada).
            target: targets.get(metric)?.target || null,
            actual: actual[metric],
            inherited: targets.get(metric)?.inherited ?? false,
          }))
        : null,
    team: professionals.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      avatarUrl: p.avatarUrl,
      revenue: {
        target: p.monthlyGoal && p.monthlyGoal > 0 ? p.monthlyGoal : null,
        actual: byPro.get(p.id)?.base ?? 0,
      },
      appointments: {
        target:
          p.monthlyAppointmentsGoal && p.monthlyAppointmentsGoal > 0
            ? p.monthlyAppointmentsGoal
            : null,
        actual: byPro.get(p.id)?.appointments ?? 0,
      },
    })),
  };
}

/**
 * Meta da empresa a partir deste mês. null = sem meta a partir deste mês: grava 0, para a meta
 * dos meses anteriores não voltar a valer.
 */
export async function setCompanyGoal(
  company: { id: string; timezone: string },
  metric: GoalMetric,
  target: number | null,
  userId: string,
) {
  const month = currentMonth(company.timezone);
  if (target !== null) {
    await setPeriodGoal(company.id, userId, { metric, month, target });
    return;
  }
  await prisma.periodGoal.upsert({
    where: { companyId_metric_month: { companyId: company.id, metric, month } },
    create: { companyId: company.id, metric, month, target: 0, updatedByUserId: userId },
    update: { target: 0, updatedByUserId: userId },
  });
}

export async function setProfessionalGoals(
  companyId: string,
  professionalId: string,
  goals: { revenue: number | null; appointments: number | null },
) {
  const result = await prisma.professional.updateMany({
    where: { id: professionalId, companyId },
    data: {
      monthlyGoal: goals.revenue && goals.revenue > 0 ? goals.revenue : null,
      monthlyAppointmentsGoal:
        goals.appointments && goals.appointments > 0 ? Math.round(goals.appointments) : null,
    },
  });
  if (result.count === 0) throw new UserError('Profissional não encontrado.');
}

export async function setShareGoalsWithTeam(companyId: string, share: boolean) {
  await prisma.company.update({ where: { id: companyId }, data: { shareGoalsWithTeam: share } });
}
