import { prisma } from '@/lib/db';
import { calendarDateToUtc, utcToCalendarDate } from '@/lib/time';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Metas por período (Pro): um alvo por indicador e por mês, no fuso da empresa. O realizado é
  sempre calculado a partir dos registros (nunca digitado). A projeção só existe no mês corrente e
  é o ritmo de hoje esticado até o fim do mês — uma estimativa, não uma promessa.
*/

export const GOAL_METRICS = {
  received: {
    label: 'Recebido',
    unit: 'R$',
    formula: 'Soma das entradas pagas no mês (data do pagamento).',
  },
  appointments_done: {
    label: 'Atendimentos concluídos',
    unit: 'n',
    formula: 'Atendimentos com status "Concluído" que aconteceram no mês.',
  },
  new_clients: {
    label: 'Clientes novos',
    unit: 'n',
    formula: 'Clientes cadastrados no mês.',
  },
  quotes_approved: {
    label: 'Orçamentos aprovados',
    unit: 'n',
    formula: 'Orçamentos aprovados no mês (data da aprovação).',
  },
} as const;
export type GoalMetric = keyof typeof GOAL_METRICS;
export const GOAL_METRIC_KEYS = Object.keys(GOAL_METRICS) as GoalMetric[];

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Início e fim (exclusivo) do mês "AAAA-MM" no fuso da empresa. */
export function monthRange(month: string, timezone: string) {
  const m = MONTH_RE.exec(month);
  if (!m) throw new UserError('Mês inválido.');
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const start = calendarDateToUtc({ year, month: mon, day: 1 }, 0, timezone);
  const next = mon === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: mon + 1, day: 1 };
  return { start, end: calendarDateToUtc(next, 0, timezone) };
}

export function currentMonth(timezone: string, now = new Date()) {
  const d = utcToCalendarDate(now, timezone);
  return `${d.year}-${String(d.month).padStart(2, '0')}`;
}

/** Mês anterior/seguinte de "AAAA-MM". */
export function shiftMonth(month: string, delta: number) {
  const m = MONTH_RE.exec(month);
  if (!m) throw new UserError('Mês inválido.');
  const total = Number(m[1]) * 12 + Number(m[2]) - 1 + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

async function actuals(companyId: string, start: Date, end: Date) {
  const [received, done, clients, quotes] = await Promise.all([
    prisma.transaction.aggregate({
      where: { companyId, type: 'INCOME', status: 'PAID', paidAt: { gte: start, lt: end } },
      _sum: { amount: true },
    }),
    prisma.appointment.count({
      where: { companyId, status: 'DONE', startAt: { gte: start, lt: end } },
    }),
    prisma.client.count({ where: { companyId, createdAt: { gte: start, lt: end } } }),
    prisma.quote.count({ where: { companyId, approvedAt: { gte: start, lt: end } } }),
  ]);
  return {
    received: Math.round(Number(received._sum.amount ?? 0) * 100) / 100,
    appointments_done: done,
    new_clients: clients,
    quotes_approved: quotes,
  } satisfies Record<GoalMetric, number>;
}

export async function getPeriodGoals(
  companyId: string,
  timezone: string,
  month: string,
  now = new Date(),
) {
  const { start, end } = monthRange(month, timezone);
  const [rows, actual] = await Promise.all([
    prisma.periodGoal.findMany({ where: { companyId, month } }),
    actuals(companyId, start, end),
  ]);
  const targets = new Map(rows.map((r) => [r.metric, Number(r.target)]));
  // Só o mês em andamento tem projeção; passado e futuro mostram o que é.
  const running = now >= start && now < end;
  const elapsed = running
    ? (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())
    : 0;
  return {
    month,
    running,
    items: GOAL_METRIC_KEYS.map((metric) => {
      const target = targets.get(metric) ?? null;
      const value = actual[metric];
      const projection =
        running && elapsed > 0.05 ? Math.round((value / elapsed) * 100) / 100 : null;
      return {
        metric,
        ...GOAL_METRICS[metric],
        target,
        value,
        pct: target && target > 0 ? Math.round((value / target) * 1000) / 10 : null,
        projection,
      };
    }),
  };
}

/** Define (ou apaga, com `null`) a meta de um indicador num mês. */
export async function setPeriodGoal(
  companyId: string,
  userId: string,
  input: { metric: GoalMetric; month: string; target: number | null },
) {
  if (!GOAL_METRIC_KEYS.includes(input.metric)) throw new UserError('Indicador inválido.');
  if (!MONTH_RE.test(input.month)) throw new UserError('Mês inválido.');
  const where = {
    companyId_metric_month: { companyId, metric: input.metric, month: input.month },
  };
  if (input.target === null) {
    await prisma.periodGoal.deleteMany({
      where: { companyId, metric: input.metric, month: input.month },
    });
  } else {
    if (!(input.target > 0) || input.target > 1e10) throw new UserError('Meta inválida.');
    await prisma.periodGoal.upsert({
      where,
      create: {
        companyId,
        metric: input.metric,
        month: input.month,
        target: input.target,
        updatedByUserId: userId,
      },
      update: { target: input.target, updatedByUserId: userId },
    });
  }
  await recordAuditLog({
    companyId,
    entityType: 'PeriodGoal',
    entityId: `${input.metric}:${input.month}`,
    action: input.target === null ? 'deleted' : 'updated',
    userId,
    metadata: { target: input.target },
  });
}

/** Copia as metas de um mês para o seguinte (só as que ainda não existem lá). */
export async function copyPeriodGoals(companyId: string, userId: string, from: string, to: string) {
  if (!MONTH_RE.test(from) || !MONTH_RE.test(to)) throw new UserError('Mês inválido.');
  const source = await prisma.periodGoal.findMany({ where: { companyId, month: from } });
  if (!source.length) throw new UserError('Não há metas nesse mês para copiar.');
  const created = await prisma.periodGoal.createMany({
    data: source.map((g) => ({
      companyId,
      metric: g.metric,
      month: to,
      target: g.target,
      updatedByUserId: userId,
    })),
    skipDuplicates: true,
  });
  return { copied: created.count };
}
