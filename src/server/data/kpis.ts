import { prisma } from '@/lib/db';

/*
  Indicadores avançados (Pro). Cada indicador vem com a fórmula e o denominador; com menos de
  MIN_SAMPLE casos, a tela avisa que a amostra é pequena. Valores previstos (estimativas de
  oportunidades) e recebidos (pagamentos lançados) nunca se misturam; margem não é lucro líquido;
  nada é atribuído à IA nem convertido em "horas economizadas".
*/

export const MIN_SAMPLE = 5;
const DAY = 86_400_000;

export type Kpi = {
  key: string;
  label: string;
  value: number | null;
  unit: '%' | 'dias' | 'R$' | 'n';
  numerator?: number;
  denominator?: number;
  formula: string;
  smallSample: boolean;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export async function getAdvancedKpis(companyId: string, days = 90, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY);
  const [
    won,
    lost,
    quotesSent,
    quotesApproved,
    events,
    served,
    tasksDone,
    jobsDone,
    pipeline,
    received,
    owners,
  ] = await Promise.all([
    prisma.opportunity.count({ where: { companyId, status: 'WON', wonAt: { gte: since } } }),
    prisma.opportunity.count({ where: { companyId, status: 'LOST', lostAt: { gte: since } } }),
    prisma.quote.count({ where: { companyId, sentAt: { gte: since } } }),
    prisma.quote.count({ where: { companyId, sentAt: { gte: since }, approvedAt: { not: null } } }),
    prisma.opportunityEvent.findMany({
      where: {
        companyId,
        createdAt: { gte: new Date(since.getTime() - 60 * DAY) },
        toStageId: { not: null },
      },
      select: { opportunityId: true, toStageId: true, createdAt: true },
      orderBy: [{ opportunityId: 'asc' }, { createdAt: 'asc' }],
      take: 5000,
    }),
    prisma.appointment.findMany({
      where: { companyId, status: 'DONE', startAt: { gte: since } },
      select: { clientId: true },
      distinct: ['clientId'],
    }),
    prisma.task.findMany({
      where: { companyId, status: 'DONE', completedAt: { gte: since }, dueAt: { not: null } },
      select: { completedAt: true, dueAt: true, assignedUserId: true },
      take: 5000,
    }),
    prisma.job.findMany({
      where: { companyId, completedAt: { gte: since }, dueAt: { not: null } },
      select: { completedAt: true, dueAt: true },
      take: 2000,
    }),
    prisma.opportunity.aggregate({
      where: { companyId, status: 'OPEN' },
      _sum: { estimatedValue: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { companyId, type: 'INCOME', status: 'PAID', paidAt: { gte: since } },
      _sum: { amount: true },
    }),
    prisma.opportunity.groupBy({
      by: ['ownerUserId', 'status'],
      where: { companyId, OR: [{ wonAt: { gte: since } }, { lostAt: { gte: since } }] },
      _count: true,
      _sum: { estimatedValue: true },
    }),
  ]);

  // Clientes que voltaram: atendidos no período que já tinham atendimento concluído antes.
  const servedIds = served.map((s) => s.clientId);
  const returning = servedIds.length
    ? (
        await prisma.appointment.findMany({
          where: { companyId, status: 'DONE', startAt: { lt: since }, clientId: { in: servedIds } },
          select: { clientId: true },
          distinct: ['clientId'],
        })
      ).length
    : 0;

  // Tempo por etapa: do evento que entrou na etapa até o próximo evento da mesma oportunidade.
  const stageDurations = new Map<string, number[]>();
  for (let i = 0; i < events.length - 1; i++) {
    const cur = events[i];
    const next = events[i + 1];
    if (next.opportunityId !== cur.opportunityId || !cur.toStageId) continue;
    if (next.createdAt < since) continue;
    const list = stageDurations.get(cur.toStageId) ?? [];
    list.push((next.createdAt.getTime() - cur.createdAt.getTime()) / DAY);
    stageDurations.set(cur.toStageId, list);
  }
  const stages = await prisma.opportunityStage.findMany({
    where: { companyId },
    select: { id: true, name: true, position: true },
  });
  const timePerStage = stages
    .sort((a, b) => a.position - b.position)
    .filter((s) => stageDurations.has(s.id))
    .map((s) => {
      const list = stageDurations.get(s.id)!;
      return {
        stage: s.name,
        averageDays: Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10,
        samples: list.length,
        smallSample: list.length < MIN_SAMPLE,
      };
    });

  const onTime = tasksDone.filter((t) => t.completedAt! <= t.dueAt!).length;
  const jobsOnTime = jobsDone.filter((j) => j.completedAt! <= j.dueAt!).length;

  const kpis: Kpi[] = [
    {
      key: 'conversion',
      label: 'Conversão de oportunidades',
      value: pct(won, won + lost),
      unit: '%',
      numerator: won,
      denominator: won + lost,
      formula: 'ganhas ÷ (ganhas + perdidas) encerradas no período',
      smallSample: won + lost < MIN_SAMPLE,
    },
    {
      key: 'quoteApproval',
      label: 'Aprovação de orçamentos',
      value: pct(quotesApproved, quotesSent),
      unit: '%',
      numerator: quotesApproved,
      denominator: quotesSent,
      formula: 'enviados no período que foram aprovados ÷ enviados no período',
      smallSample: quotesSent < MIN_SAMPLE,
    },
    {
      key: 'returning',
      label: 'Retorno de clientes',
      value: pct(returning, servedIds.length),
      unit: '%',
      numerator: returning,
      denominator: servedIds.length,
      formula:
        'clientes atendidos no período que já tinham vindo antes ÷ clientes atendidos no período',
      smallSample: servedIds.length < MIN_SAMPLE,
    },
    {
      key: 'taskDeadlines',
      label: 'Tarefas concluídas no prazo',
      value: pct(onTime, tasksDone.length),
      unit: '%',
      numerator: onTime,
      denominator: tasksDone.length,
      formula: 'concluídas até o prazo ÷ concluídas no período (só tarefas com prazo)',
      smallSample: tasksDone.length < MIN_SAMPLE,
    },
    {
      key: 'jobDeadlines',
      label: 'Serviços entregues no prazo',
      value: pct(jobsOnTime, jobsDone.length),
      unit: '%',
      numerator: jobsOnTime,
      denominator: jobsDone.length,
      formula: 'concluídos até o prazo ÷ concluídos no período (só com prazo)',
      smallSample: jobsDone.length < MIN_SAMPLE,
    },
    {
      key: 'pipeline',
      label: 'Previsto em oportunidades abertas',
      value: Number(pipeline._sum.estimatedValue ?? 0),
      unit: 'R$',
      denominator: pipeline._count,
      formula: 'soma do valor ESTIMADO das oportunidades abertas (não é receita)',
      smallSample: false,
    },
    {
      key: 'received',
      label: 'Recebido no período',
      value: Number(received._sum.amount ?? 0),
      unit: 'R$',
      formula: 'entradas marcadas como pagas no período (pela data do pagamento)',
      smallSample: false,
    },
  ];

  const byOwner = new Map<
    string,
    { won: number; lost: number; wonEstimated: number; tasksDone: number }
  >();
  const row = (k: string) => byOwner.get(k) ?? { won: 0, lost: 0, wonEstimated: 0, tasksDone: 0 };
  for (const o of owners) {
    const k = o.ownerUserId ?? 'none';
    const r = row(k);
    if (o.status === 'WON') {
      r.won += o._count;
      r.wonEstimated += Number(o._sum.estimatedValue ?? 0);
    } else if (o.status === 'LOST') r.lost += o._count;
    byOwner.set(k, r);
  }
  for (const t of tasksDone) {
    const k = t.assignedUserId ?? 'none';
    const r = row(k);
    r.tasksDone += 1;
    byOwner.set(k, r);
  }

  return {
    days,
    kpis,
    timePerStage,
    byOwner: [...byOwner.entries()].map(([ownerUserId, r]) => ({
      ownerUserId: ownerUserId === 'none' ? null : ownerUserId,
      ...r,
      conversion: pct(r.won, r.won + r.lost),
    })),
  };
}
