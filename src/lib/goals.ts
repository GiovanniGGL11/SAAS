/*
  Ritmo de uma meta no mês: quanto já foi feito, quanto era esperado até hoje (meta proporcional
  aos dias), quanto falta por dia nos dias que restam e a projeção para o fim do mês no ritmo atual.
*/

export type GoalStatus = 'none' | 'done' | 'ahead' | 'on_track' | 'behind';

export type GoalPace = {
  /** 0–100+ (pode passar de 100). null sem meta. */
  percent: number | null;
  /** Meta proporcional até hoje. */
  expectedNow: number | null;
  remaining: number | null;
  /** Quanto precisa por dia, contando hoje, para bater a meta. */
  perDayNeeded: number | null;
  /** Fim do mês no ritmo atual. */
  projection: number;
  status: GoalStatus;
  daysLeft: number;
};

/** Margem para "no ritmo": até 5% abaixo do esperado ainda conta como em dia. */
const TOLERANCE = 0.05;

export function goalPace(params: {
  target: number | null;
  actual: number;
  dayOfMonth: number;
  totalDays: number;
}): GoalPace {
  const { target, actual } = params;
  const day = Math.min(Math.max(params.dayOfMonth, 1), params.totalDays);
  const daysLeft = params.totalDays - day + 1;
  const projection = Math.round((actual / day) * params.totalDays * 100) / 100;
  if (!target || target <= 0) {
    return {
      percent: null,
      expectedNow: null,
      remaining: null,
      perDayNeeded: null,
      projection,
      status: 'none',
      daysLeft,
    };
  }
  const expectedNow = (target * day) / params.totalDays;
  const remaining = Math.max(target - actual, 0);
  const status: GoalStatus =
    actual >= target
      ? 'done'
      : actual >= expectedNow
        ? 'ahead'
        : actual >= expectedNow * (1 - TOLERANCE)
          ? 'on_track'
          : 'behind';
  return {
    percent: Math.round((actual / target) * 1000) / 10,
    expectedNow: Math.round(expectedNow * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
    perDayNeeded: remaining > 0 ? Math.round((remaining / daysLeft) * 100) / 100 : 0,
    projection,
    status,
    daysLeft,
  };
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  none: 'Sem meta',
  done: 'Meta batida',
  ahead: 'À frente do ritmo',
  on_track: 'No ritmo',
  behind: 'Abaixo do ritmo',
};
