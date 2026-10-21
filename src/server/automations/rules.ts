import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';
import { createTask } from '@/server/data/tasks';
import { hasFeature } from '@/server/billing/features';
import { getPreferences } from '@/server/data/business-preferences';
import { finishRun, recordSkip, startRun } from './runs';

/*
  Automações configuráveis (Pro). Regras determinísticas — nenhuma chamada de IA:
  gatilho (com parâmetro) → ação (criar tarefa ou avisar o responsável no sino).
  - Prévia: mostra o que a regra faria agora, sem fazer nada.
  - Deduplicação por regra + registro (+ momento do gatilho): nunca a mesma tarefa duas vezes.
  - Limite diário por regra e janela de relevância: ao reativar, só entram gatilhos recentes
    (nada de despejar o acumulado de meses).
  - Sem laços: as ações só criam tarefas, e tarefas não são gatilho de nenhuma regra.
  - Pausa: regra a regra (ativa/pausada) e a pausa geral das Preferências.
*/

export const RULE_TRIGGERS = {
  quote_no_response: {
    label: 'Orçamento sem resposta',
    param: 'dias desde o envio',
    defaultDays: 5,
  },
  appointment_done: {
    label: 'Atendimento concluído (preparar pesquisa)',
    param: 'horas depois',
    defaultDays: 1,
  },
  bill_due_soon: { label: 'Conta próxima do vencimento', param: 'dias antes', defaultDays: 3 },
  job_overdue: { label: 'Serviço em andamento atrasado', param: 'dias de atraso', defaultDays: 0 },
  opportunity_stale: {
    label: 'Oportunidade parada',
    param: 'dias sem mudar de etapa',
    defaultDays: 7,
  },
} as const;
export type RuleTrigger = keyof typeof RULE_TRIGGERS;

export const RULE_ACTIONS = {
  create_task: 'Criar tarefa',
  notify: 'Avisar o responsável no sino',
} as const;
export type RuleAction = keyof typeof RULE_ACTIONS;

/** Gatilhos mais antigos que isto não disparam (relevância). */
const RELEVANCE_DAYS = 14;
const DAY = 86_400_000;

type Match = {
  refId: string;
  key: string;
  title: string;
  clientId?: string | null;
  quoteId?: string;
  opportunityId?: string;
  appointmentId?: string;
  transactionId?: string;
  jobId?: string;
};

async function findMatches(
  companyId: string,
  trigger: RuleTrigger,
  days: number,
  now = new Date(),
): Promise<Match[]> {
  const relevance = new Date(now.getTime() - (days * DAY + RELEVANCE_DAYS * DAY));
  switch (trigger) {
    case 'quote_no_response': {
      const quotes = await prisma.quote.findMany({
        where: {
          companyId,
          status: 'SENT',
          sentAt: { lte: new Date(now.getTime() - days * DAY), gte: relevance },
        },
        select: {
          id: true,
          number: true,
          clientId: true,
          sentAt: true,
          client: { select: { name: true } },
        },
        take: 200,
      });
      return quotes.map((q) => ({
        refId: q.id,
        key: `quote:${q.id}:${q.sentAt?.toISOString().slice(0, 10)}`,
        title: `Retornar orçamento #${q.number} — ${q.client.name}`,
        clientId: q.clientId,
        quoteId: q.id,
      }));
    }
    case 'appointment_done': {
      // Aqui o parâmetro é em HORAS depois do atendimento; só os dos últimos 2 dias (relevância).
      const since = new Date(now.getTime() - (days * 3_600_000 + 2 * DAY));
      const done = await prisma.appointment.findMany({
        where: {
          companyId,
          status: 'DONE',
          endAt: { lte: new Date(now.getTime() - days * 3_600_000), gte: since },
          review: null,
        },
        select: {
          id: true,
          clientId: true,
          serviceNameSnapshot: true,
          client: { select: { name: true } },
        },
        take: 200,
      });
      return done.map((a) => ({
        refId: a.id,
        key: `appointment:${a.id}`,
        title: `Pedir avaliação: ${a.client.name} (${a.serviceNameSnapshot})`,
        clientId: a.clientId,
        appointmentId: a.id,
      }));
    }
    case 'bill_due_soon': {
      const bills = await prisma.transaction.findMany({
        where: {
          companyId,
          status: 'PENDING',
          dueDate: {
            gte: new Date(now.getTime() - DAY),
            lte: new Date(now.getTime() + days * DAY),
          },
        },
        select: { id: true, type: true, description: true, dueDate: true, clientId: true },
        take: 200,
      });
      return bills.map((b) => ({
        refId: b.id,
        key: `bill:${b.id}:${b.dueDate?.toISOString().slice(0, 10)}`,
        title: `${b.type === 'INCOME' ? 'A receber' : 'A pagar'} vence: ${b.description}`.slice(
          0,
          160,
        ),
        clientId: b.clientId,
        transactionId: b.id,
      }));
    }
    case 'job_overdue': {
      const jobs = await prisma.job.findMany({
        where: {
          companyId,
          completedAt: null,
          canceledAt: null,
          dueAt: { lt: new Date(now.getTime() - days * DAY), gte: relevance },
        },
        select: { id: true, title: true, clientId: true, dueAt: true },
        take: 200,
      });
      return jobs.map((j) => ({
        refId: j.id,
        key: `job:${j.id}:${j.dueAt?.toISOString().slice(0, 10)}`,
        title: `Serviço atrasado: ${j.title}`.slice(0, 160),
        clientId: j.clientId,
        jobId: j.id,
      }));
    }
    case 'opportunity_stale': {
      const opps = await prisma.opportunity.findMany({
        where: {
          companyId,
          status: 'OPEN',
          stageEnteredAt: { lte: new Date(now.getTime() - days * DAY), gte: relevance },
        },
        select: { id: true, title: true, clientId: true, stageEnteredAt: true },
        take: 200,
      });
      return opps.map((o) => ({
        refId: o.id,
        key: `opportunity:${o.id}:${o.stageEnteredAt.toISOString().slice(0, 10)}`,
        title: `Oportunidade parada: ${o.title} — definir próxima ação`.slice(0, 160),
        clientId: o.clientId,
        opportunityId: o.id,
      }));
    }
  }
}

export type RuleInput = {
  name: string;
  trigger: RuleTrigger;
  days: number;
  action: RuleAction;
  assigneeUserId?: string | null;
  maxPerDay: number;
};

function validate(input: RuleInput) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new UserError('Dê um nome à regra.');
  if (!(input.trigger in RULE_TRIGGERS)) throw new UserError('Gatilho inválido.');
  if (!(input.action in RULE_ACTIONS)) throw new UserError('Ação inválida.');
  if (!Number.isInteger(input.days) || input.days < 0 || input.days > 90)
    throw new UserError('Use de 0 a 90.');
  if (!Number.isInteger(input.maxPerDay) || input.maxPerDay < 1 || input.maxPerDay > 50)
    throw new UserError('Limite diário de 1 a 50.');
  if (input.action === 'notify' && !input.assigneeUserId)
    throw new UserError('Escolha quem será avisado.');
  return name;
}

export async function saveRule(
  companyId: string,
  userId: string,
  input: RuleInput & { id?: string },
) {
  const name = validate(input);
  const data = {
    name,
    trigger: input.trigger,
    conditions: { days: input.days } as Prisma.InputJsonValue,
    action: input.action,
    assigneeUserId: input.assigneeUserId ?? null,
    maxPerDay: input.maxPerDay,
  };
  const rule = input.id
    ? await prisma.automationRule.update({
        where: { id: (await getRule(companyId, input.id)).id },
        data,
      })
    : await prisma.automationRule.create({ data: { ...data, companyId, createdByUserId: userId } });
  await recordAuditLog({
    companyId,
    entityType: 'AutomationRule',
    entityId: rule.id,
    action: input.id ? 'updated' : 'created',
    userId,
  });
  return rule;
}

async function getRule(companyId: string, id: string) {
  const rule = await prisma.automationRule.findFirst({ where: { id, companyId } });
  if (!rule) throw new UserError('Regra não encontrada.');
  return rule;
}

export async function setRuleActive(
  companyId: string,
  userId: string,
  id: string,
  active: boolean,
) {
  await getRule(companyId, id);
  await prisma.automationRule.update({ where: { id }, data: { active } });
  await recordAuditLog({
    companyId,
    entityType: 'AutomationRule',
    entityId: id,
    action: active ? 'resumed' : 'paused',
    userId,
  });
}

export async function listRules(companyId: string) {
  return prisma.automationRule.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } });
}

/** O que a regra faria agora (sem fazer nada): os registros e quantos já foram tratados. */
export async function previewRule(
  companyId: string,
  input: Pick<RuleInput, 'trigger' | 'days'> & { id?: string },
) {
  const matches = await findMatches(companyId, input.trigger, input.days);
  const handled = input.id
    ? await prisma.task.findMany({
        where: { companyId, dedupeKey: { in: matches.map((m) => `rule:${input.id}:${m.key}`) } },
        select: { dedupeKey: true },
      })
    : [];
  const done = new Set(handled.map((h) => h.dedupeKey));
  return matches.slice(0, 30).map((m) => ({
    title: m.title,
    alreadyHandled: input.id ? done.has(`rule:${input.id}:${m.key}`) : false,
  }));
}

/**
 * Executa uma regra (rota diária ou "executar agora"). Revalida plano, pausa geral e a própria
 * regra antes de cada execução; respeita o limite diário; registra a execução.
 */
export async function runRule(
  companyId: string,
  ruleId: string,
  trigger: 'cron' | 'manual',
  now = new Date(),
) {
  const routine = `rule:${ruleId}` as never;
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) throw new UserError('Empresa não encontrada.');
  const rule = await getRule(companyId, ruleId);
  const skip = async (reason: string) => {
    await recordSkip(companyId, routine, trigger, reason);
    return { status: 'SKIPPED' as const, reason };
  };
  if (!hasFeature(company, 'automationRules'))
    return skip('O plano atual não inclui automações configuráveis.');
  if ((await getPreferences(companyId)).automationsPaused)
    return skip('Ações automáticas pausadas nas Preferências.');
  if (!rule.active) return skip('Regra pausada.');

  const startOfDay = new Date(now.getTime() - DAY);
  const createdToday = await prisma.task.count({
    where: {
      companyId,
      dedupeKey: { startsWith: `rule:${rule.id}:` },
      createdAt: { gte: startOfDay },
    },
  });
  const budget = Math.max(rule.maxPerDay - createdToday, 0);
  if (budget === 0) return skip('Limite diário da regra atingido.');

  const run = await startRun(companyId, routine, trigger);
  const stats = { matched: 0, created: 0, alreadyHandled: 0, failures: 0 };
  try {
    const days = Number((rule.conditions as { days?: number }).days ?? 0);
    const matches = await findMatches(companyId, rule.trigger as RuleTrigger, days, now);
    stats.matched = matches.length;
    for (const m of matches) {
      if (stats.created >= budget) break;
      try {
        const { created } = await createTask(companyId, 'automation', {
          title: m.title,
          clientId: m.clientId ?? null,
          quoteId: m.quoteId,
          opportunityId: m.opportunityId,
          appointmentId: m.appointmentId,
          transactionId: m.transactionId,
          assignedUserId: rule.assigneeUserId,
          priority: rule.action === 'notify' ? 'HIGH' : 'NORMAL',
          remindAt: rule.action === 'notify' ? now : null,
          dueAt: now,
          origin: 'automation:rule',
          dedupeKey: `rule:${rule.id}:${m.key}`,
        });
        if (created) stats.created++;
        else stats.alreadyHandled++;
      } catch {
        stats.failures++;
      }
    }
    await prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: now } });
    const status = stats.failures ? (stats.created ? 'PARTIAL' : 'FAILED') : 'COMPLETED';
    await finishRun(run.id, { status, stats });
    return { status, stats };
  } catch (error) {
    await finishRun(run.id, {
      status: 'FAILED',
      stats,
      note: error instanceof Error ? error.message.slice(0, 300) : 'Erro.',
    });
    throw error;
  }
}
