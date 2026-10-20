import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { TaskPriority, TaskStatus } from '@/generated/prisma/client';
import {
  addDays,
  calendarDateToUtc,
  getTodayInTz,
  utcToCalendarDate,
  utcToMinutesSinceMidnight,
  type CalendarDate,
} from '@/lib/time';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Tarefas e lembretes internos (todos os planos). Independentes ou ligadas a cliente,
  oportunidade, orçamento, agendamento, pacote ou lançamento financeiro.
  - Concluída ≠ cancelada (datas e status próprios).
  - Lembrete é interno: aparece no sino de quem é responsável; nada é enviado para fora.
  - Recorrência simples (diária, semanal, mensal): a próxima ocorrência nasce quando esta é
    concluída ou cancelada, no fuso da empresa, uma vez só (dedupeKey da série + data).
  - Histórico: cada mudança relevante vai para o AuditLog (sem texto livre longo).
  - Rotinas automáticas usam `dedupeKey` para nunca repetir a mesma tarefa.
*/

type Db = Prisma.TransactionClient | typeof prisma;

export const TASK_RECURRENCES = ['daily', 'weekly', 'monthly'] as const;
export type TaskRecurrence = (typeof TASK_RECURRENCES)[number];
export type ChecklistItem = { id: string; text: string; done: boolean };

export type TaskInput = {
  title: string;
  details?: string | null;
  dueAt?: Date | null;
  clientId?: string | null;
  quoteId?: string | null;
  clientPackageId?: string | null;
  appointmentId?: string | null;
  opportunityId?: string | null;
  transactionId?: string | null;
  origin?: string;
  dedupeKey?: string | null;
  assignedUserId?: string | null;
  priority?: TaskPriority;
  checklist?: { text: string; done?: boolean }[] | null;
  remindAt?: Date | null;
  recurrence?: TaskRecurrence | null;
  recurrenceSourceId?: string | null;
};

const taskInclude = {
  client: { select: { id: true, name: true, phone: true } },
  quote: { select: { id: true, number: true, title: true, status: true } },
  opportunity: { select: { id: true, title: true, status: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

function cleanChecklist(items: TaskInput['checklist']): ChecklistItem[] | null {
  if (!items?.length) return null;
  if (items.length > 30) throw new UserError('Até 30 itens no checklist.');
  return items
    .map((i) => ({
      id: randomUUID().slice(0, 8),
      text: i.text.trim().slice(0, 200),
      done: !!i.done,
    }))
    .filter((i) => i.text);
}

async function assertRefs(db: Db, companyId: string, input: Partial<TaskInput>) {
  const checks: [string | null | undefined, () => Promise<unknown>, string][] = [
    [
      input.clientId,
      () =>
        db.client.findFirst({ where: { id: input.clientId!, companyId }, select: { id: true } }),
      'Cliente',
    ],
    [
      input.quoteId,
      () => db.quote.findFirst({ where: { id: input.quoteId!, companyId }, select: { id: true } }),
      'Orçamento',
    ],
    [
      input.clientPackageId,
      () =>
        db.clientPackage.findFirst({
          where: { id: input.clientPackageId!, companyId },
          select: { id: true },
        }),
      'Pacote',
    ],
    [
      input.appointmentId,
      () =>
        db.appointment.findFirst({
          where: { id: input.appointmentId!, companyId },
          select: { id: true },
        }),
      'Agendamento',
    ],
    [
      input.opportunityId,
      () =>
        db.opportunity.findFirst({
          where: { id: input.opportunityId!, companyId },
          select: { id: true },
        }),
      'Oportunidade',
    ],
    [
      input.transactionId,
      () =>
        db.transaction.findFirst({
          where: { id: input.transactionId!, companyId },
          select: { id: true },
        }),
      'Lançamento',
    ],
  ];
  for (const [value, find, label] of checks) {
    if (value && !(await find())) throw new UserError(`${label} não encontrado.`);
  }
}

/**
 * Cria a tarefa. Com `dedupeKey`, é idempotente: se já existe, devolve a existente em vez de
 * duplicar — rotina rodando duas vezes, clique duplo, recorrência gerada duas vezes.
 */
export async function createTask(
  companyId: string,
  userId: string,
  input: TaskInput,
  db: Db = prisma,
): Promise<{ task: TaskWithRelations; created: boolean }> {
  const title = input.title.trim();
  if (!title || title.length > 160) throw new UserError('Dê um título curto à tarefa.');
  if (input.recurrence && !input.dueAt) {
    throw new UserError('Tarefa que se repete precisa de prazo.');
  }
  await assertRefs(db, companyId, input);
  if (input.dedupeKey) {
    const existing = await db.task.findUnique({
      where: { companyId_dedupeKey: { companyId, dedupeKey: input.dedupeKey } },
      include: taskInclude,
    });
    if (existing) return { task: existing, created: false };
  }
  try {
    const task = await db.task.create({
      data: {
        companyId,
        title,
        details: input.details?.trim().slice(0, 4000) || null,
        dueAt: input.dueAt ?? null,
        clientId: input.clientId ?? null,
        quoteId: input.quoteId ?? null,
        clientPackageId: input.clientPackageId ?? null,
        appointmentId: input.appointmentId ?? null,
        opportunityId: input.opportunityId ?? null,
        transactionId: input.transactionId ?? null,
        origin: input.origin ?? 'manual',
        dedupeKey: input.dedupeKey ?? null,
        assignedUserId: input.assignedUserId ?? null,
        priority: input.priority ?? 'NORMAL',
        checklist: (cleanChecklist(input.checklist) ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        remindAt: input.remindAt ?? null,
        recurrence: input.recurrence ?? null,
        recurrenceSourceId: input.recurrenceSourceId ?? null,
        createdByUserId: userId,
      },
      include: taskInclude,
    });
    await recordAuditLog(
      {
        companyId,
        entityType: 'Task',
        entityId: task.id,
        action: 'created',
        userId,
        metadata: { origin: task.origin },
      },
      db as Prisma.TransactionClient,
    );
    return { task, created: true };
  } catch (error) {
    if (
      input.dedupeKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await db.task.findUniqueOrThrow({
        where: { companyId_dedupeKey: { companyId, dedupeKey: input.dedupeKey } },
        include: taskInclude,
      });
      return { task: existing, created: false };
    }
    throw error;
  }
}

// ---- Listagem --------------------------------------------------------------------------------

export type TaskFilter = {
  status?: TaskStatus | 'ACTIVE';
  assignedUserId?: string | null;
  priority?: TaskPriority;
  /** overdue | today | future | none (sem prazo) */
  due?: 'overdue' | 'today' | 'future' | 'none';
  clientId?: string;
  quoteId?: string;
  opportunityId?: string;
  search?: string;
};

export async function listTasks(
  companyId: string,
  filter: TaskFilter = {},
  limit = 100,
  timezone = 'America/Sao_Paulo',
): Promise<TaskWithRelations[]> {
  const today = getTodayInTz(timezone);
  const startToday = calendarDateToUtc(today, 0, timezone);
  const startTomorrow = calendarDateToUtc(addDays(today, 1), 0, timezone);
  const status = filter.status ?? 'ACTIVE';
  const dueWhere: Prisma.TaskWhereInput =
    filter.due === 'overdue'
      ? { dueAt: { lt: startToday } }
      : filter.due === 'today'
        ? { dueAt: { gte: startToday, lt: startTomorrow } }
        : filter.due === 'future'
          ? { dueAt: { gte: startTomorrow } }
          : filter.due === 'none'
            ? { dueAt: null }
            : {};
  return prisma.task.findMany({
    where: {
      companyId,
      status: status === 'ACTIVE' ? { in: ['OPEN', 'IN_PROGRESS'] } : status,
      ...(filter.assignedUserId !== undefined ? { assignedUserId: filter.assignedUserId } : {}),
      ...(filter.priority ? { priority: filter.priority } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
      ...(filter.quoteId ? { quoteId: filter.quoteId } : {}),
      ...(filter.opportunityId ? { opportunityId: filter.opportunityId } : {}),
      ...(filter.search
        ? { title: { contains: filter.search.trim().slice(0, 80), mode: 'insensitive' } }
        : {}),
      ...dueWhere,
    },
    include: taskInclude,
    // Sem prazo vai para o fim; urgentes primeiro no mesmo prazo.
    orderBy: [
      { dueAt: { sort: 'asc', nulls: 'last' } },
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
    take: limit,
  });
}

export async function countOpenTasksDue(companyId: string, until: Date) {
  return prisma.task.count({
    where: {
      companyId,
      status: { in: ['OPEN', 'IN_PROGRESS'] },
      OR: [{ dueAt: null }, { dueAt: { lte: until } }],
    },
  });
}

// ---- Alterações --------------------------------------------------------------------------------

async function loadTask(companyId: string, id: string) {
  const task = await prisma.task.findFirst({ where: { id, companyId } });
  if (!task) throw new UserError('Tarefa não encontrada.');
  return task;
}

export type TaskPatch = Partial<
  Pick<
    TaskInput,
    | 'title'
    | 'details'
    | 'dueAt'
    | 'assignedUserId'
    | 'priority'
    | 'remindAt'
    | 'recurrence'
    | 'clientId'
    | 'opportunityId'
  >
>;

/** Edita a tarefa e registra no histórico o que mudou (campos e valores curtos). */
export async function updateTask(companyId: string, userId: string, id: string, patch: TaskPatch) {
  const task = await loadTask(companyId, id);
  if (task.status === 'DONE' || task.status === 'CANCELED') {
    throw new UserError('Tarefa encerrada não é editada. Reabra antes, se precisar.');
  }
  await assertRefs(prisma, companyId, patch);
  const data: Prisma.TaskUncheckedUpdateInput = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const track = <K extends keyof typeof task>(
    key: K,
    value: (typeof task)[K] | undefined,
    label = key as string,
  ) => {
    if (value === undefined) return;
    const before = task[key] instanceof Date ? (task[key] as Date).toISOString() : task[key];
    const after = value instanceof Date ? value.toISOString() : value;
    if (before === after) return;
    (data as Record<string, unknown>)[key as string] = value;
    changes[label] = {
      from: label === 'details' ? '…' : before,
      to: label === 'details' ? '…' : after,
    };
  };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title || title.length > 160) throw new UserError('Dê um título curto à tarefa.');
    track('title', title);
  }
  track(
    'details',
    patch.details === undefined ? undefined : patch.details?.trim().slice(0, 4000) || null,
  );
  track('dueAt', patch.dueAt);
  track('assignedUserId', patch.assignedUserId);
  track('priority', patch.priority);
  track('remindAt', patch.remindAt);
  track('recurrence', patch.recurrence);
  track('clientId', patch.clientId);
  track('opportunityId', patch.opportunityId);
  if ((data.recurrence ?? task.recurrence) && !(data.dueAt ?? task.dueAt)) {
    throw new UserError('Tarefa que se repete precisa de prazo.');
  }
  if (Object.keys(changes).length === 0) return { changed: false };
  // Lembrete mudou: volta a valer (o aviso no sino tem id novo).
  await prisma.task.update({ where: { id }, data });
  await recordAuditLog({
    companyId,
    entityType: 'Task',
    entityId: id,
    action: 'updated',
    userId,
    metadata: changes as Prisma.InputJsonValue,
  });
  return { changed: true };
}

/** Próximo prazo da série, no fuso da empresa, mantendo o horário do dia. */
export function nextOccurrence(dueAt: Date, recurrence: TaskRecurrence, timezone: string): Date {
  const date = utcToCalendarDate(dueAt, timezone);
  const minutes = utcToMinutesSinceMidnight(dueAt, timezone);
  let next: CalendarDate;
  if (recurrence === 'daily') next = addDays(date, 1);
  else if (recurrence === 'weekly') next = addDays(date, 7);
  else {
    // Mensal: mesmo dia no mês seguinte; se o mês não tiver o dia (31), usa o último dia.
    const month = date.month === 12 ? 1 : date.month + 1;
    const year = date.month === 12 ? date.year + 1 : date.year;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    next = { year, month, day: Math.min(date.day, lastDay) };
  }
  return calendarDateToUtc(next, minutes, timezone);
}

/**
 * Muda o status. Concluir e cancelar são diferentes (datas próprias). Se a tarefa se repete, a
 * próxima ocorrência nasce uma vez só, ao encerrar esta.
 */
export async function setTaskStatus(
  companyId: string,
  userId: string,
  id: string,
  status: TaskStatus,
  timezone = 'America/Sao_Paulo',
) {
  const closing = status === 'DONE' || status === 'CANCELED';
  const result = await prisma.task.updateMany({
    where: {
      id,
      companyId,
      status: closing
        ? { in: ['OPEN', 'IN_PROGRESS'] }
        : status === 'OPEN'
          ? { not: 'OPEN' }
          : 'OPEN',
    },
    data:
      status === 'DONE'
        ? { status, completedAt: new Date(), completedByUserId: userId, canceledAt: null }
        : status === 'CANCELED'
          ? { status, canceledAt: new Date(), completedAt: null, completedByUserId: null }
          : { status, completedAt: null, completedByUserId: null, canceledAt: null },
  });
  if (result.count === 0) throw new UserError('Essa tarefa já foi atualizada.');
  await recordAuditLog({
    companyId,
    entityType: 'Task',
    entityId: id,
    action: status === 'DONE' ? 'completed' : status === 'CANCELED' ? 'canceled' : 'status_changed',
    userId,
    metadata: { status },
  });
  if (!closing) return { next: null };
  const task = await loadTask(companyId, id);
  if (!task.recurrence || !task.dueAt) return { next: null };
  const recurrence = task.recurrence as TaskRecurrence;
  const dueAt = nextOccurrence(task.dueAt, recurrence, timezone);
  const sourceId = task.recurrenceSourceId ?? task.id;
  const { task: next } = await createTask(companyId, userId, {
    title: task.title,
    details: task.details,
    dueAt,
    clientId: task.clientId,
    opportunityId: task.opportunityId,
    assignedUserId: task.assignedUserId,
    priority: task.priority,
    checklist: ((task.checklist ?? []) as ChecklistItem[]).map((i) => ({
      text: i.text,
      done: false,
    })),
    remindAt: task.remindAt
      ? new Date(dueAt.getTime() - (task.dueAt.getTime() - task.remindAt.getTime()))
      : null,
    recurrence,
    recurrenceSourceId: sourceId,
    origin: task.origin,
    dedupeKey: `recur:${sourceId}:${dueAt.toISOString().slice(0, 16)}`,
  });
  return { next: { id: next.id, dueAt: next.dueAt?.toISOString() ?? null } };
}

/** Marca/desmarca um item do checklist (atualização atômica, sem sobrescrever outros itens). */
export async function toggleChecklistItem(
  companyId: string,
  userId: string,
  id: string,
  itemId: string,
  done: boolean,
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ checklist: unknown }[]>`
      SELECT checklist FROM "Task" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
    if (!rows.length) throw new UserError('Tarefa não encontrada.');
    const items = (rows[0].checklist ?? []) as ChecklistItem[];
    if (!items.some((i) => i.id === itemId)) throw new UserError('Item não encontrado.');
    const next = items.map((i) => (i.id === itemId ? { ...i, done } : i));
    await tx.task.update({ where: { id }, data: { checklist: next as Prisma.InputJsonValue } });
    return next;
  });
}

export async function setChecklist(
  companyId: string,
  userId: string,
  id: string,
  items: { id?: string; text: string; done?: boolean }[],
) {
  await loadTask(companyId, id);
  if (items.length > 30) throw new UserError('Até 30 itens no checklist.');
  const next = items
    .map((i) => ({
      id: i.id || randomUUID().slice(0, 8),
      text: i.text.trim().slice(0, 200),
      done: !!i.done,
    }))
    .filter((i) => i.text);
  await prisma.task.update({
    where: { id },
    data: { checklist: next.length ? next : Prisma.JsonNull },
  });
  await recordAuditLog({
    companyId,
    entityType: 'Task',
    entityId: id,
    action: 'updated',
    userId,
    metadata: { checklist: next.length },
  });
}

// ---- Comentários e histórico -----------------------------------------------------------------

export async function addTaskComment(
  companyId: string,
  userId: string,
  taskId: string,
  body: string,
) {
  const text = body.trim();
  if (!text) throw new UserError('Escreva o comentário.');
  if (text.length > 2000) throw new UserError('Comentário longo demais (até 2.000 caracteres).');
  await loadTask(companyId, taskId);
  return prisma.taskComment.create({ data: { companyId, taskId, userId, body: text } });
}

export async function getTaskDetail(companyId: string, id: string) {
  const task = await prisma.task.findFirst({
    where: { id, companyId },
    include: {
      ...taskInclude,
      comments: { orderBy: { createdAt: 'asc' }, take: 200 },
    },
  });
  if (!task) throw new UserError('Tarefa não encontrada.');
  const history = await prisma.auditLog.findMany({
    where: { companyId, entityType: 'Task', entityId: id },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { id: true, action: true, userId: true, metadata: true, createdAt: true },
  });
  return { task, history };
}

// ---- Lembretes internos ----------------------------------------------------------------------

/**
 * Lembretes que já venceram para a pessoa (responsável, ou quem criou se não há responsável).
 * O id do aviso inclui a hora do lembrete: mudar o lembrete gera um aviso novo, e o mesmo
 * lembrete nunca aparece duas vezes.
 */
export async function dueReminders(companyId: string, userId: string, now = new Date()) {
  const tasks = await prisma.task.findMany({
    where: {
      companyId,
      status: { in: ['OPEN', 'IN_PROGRESS'] },
      remindAt: { lte: now, gte: new Date(now.getTime() - 7 * 86_400_000) },
      OR: [{ assignedUserId: userId }, { assignedUserId: null, createdByUserId: userId }],
    },
    select: { id: true, title: true, remindAt: true, dueAt: true },
    orderBy: { remindAt: 'desc' },
    take: 10,
  });
  return tasks.map((t) => ({ id: t.id, title: t.title, remindAt: t.remindAt!, dueAt: t.dueAt }));
}
