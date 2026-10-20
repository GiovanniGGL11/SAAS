'use server';

import { z } from 'zod';

import { calendarDateToUtc } from '@/lib/time';
import { toActionResult } from '@/server/action-result';
import { UserError } from '@/server/errors';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { assertTeamMember, listTeamMembers } from '@/server/team';
import {
  TASK_RECURRENCES,
  addTaskComment,
  createTask,
  getTaskDetail,
  listTasks,
  setChecklist,
  setTaskStatus,
  toggleChecklistItem,
  updateTask,
} from '@/server/data/tasks';

/*
  Tarefas e lembretes internos — todos os planos. A empresa vem sempre da sessão; datas chegam
  como dia/hora locais e viram instantes no fuso da EMPRESA (não do navegador).
*/

const id = z.string().min(1).max(64);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeKey = z.string().regex(/^\d{2}:\d{2}$/);
const priority = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

function toInstant(
  date: string | null | undefined,
  time: string | null | undefined,
  timezone: string,
  fallbackMinutes: number,
) {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const minutes = time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : fallbackMinutes;
  return calendarDateToUtc({ year: y, month: m, day: d }, minutes, timezone);
}

async function assertAssignee(clerkOrgId: string, userId: string | null | undefined) {
  if (userId && !(await assertTeamMember(clerkOrgId, userId))) {
    throw new UserError('Responsável não faz parte da equipe.');
  }
}

function serialize(t: Awaited<ReturnType<typeof listTasks>>[number]) {
  return {
    id: t.id,
    title: t.title,
    details: t.details,
    dueAt: t.dueAt?.toISOString() ?? null,
    remindAt: t.remindAt?.toISOString() ?? null,
    status: t.status,
    priority: t.priority,
    origin: t.origin,
    recurrence: t.recurrence,
    assignedUserId: t.assignedUserId,
    checklist: (t.checklist ?? []) as { id: string; text: string; done: boolean }[],
    client: t.client,
    quote: t.quote,
    opportunity: t.opportunity,
    clientPackageId: t.clientPackageId,
    appointmentId: t.appointmentId,
    transactionId: t.transactionId,
    comments: t._count.comments,
  };
}

export type TaskListItem = ReturnType<typeof serialize>;

export async function listTasksAction(input: unknown) {
  return toActionResult(async () => {
    const filter = z
      .object({
        status: z.enum(['ACTIVE', 'OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED']).optional(),
        /** "me" = a própria pessoa; "none" = sem responsável. */
        assignee: z.string().max(64).optional(),
        priority: priority.optional(),
        due: z.enum(['overdue', 'today', 'future', 'none']).optional(),
        clientId: z.string().max(64).optional(),
        opportunityId: z.string().max(64).optional(),
        search: z.string().max(80).optional(),
      })
      .parse(input ?? {});
    const { company, userId } = await requireCurrentCompany();
    const tasks = await listTasks(
      company.id,
      {
        status: filter.status,
        assignedUserId:
          filter.assignee === 'me'
            ? userId
            : filter.assignee === 'none'
              ? null
              : filter.assignee || undefined,
        priority: filter.priority,
        due: filter.due,
        clientId: filter.clientId,
        opportunityId: filter.opportunityId,
        search: filter.search,
      },
      200,
      company.timezone,
    );
    return tasks.map(serialize);
  });
}

export async function listTeamAction() {
  return toActionResult(async () => {
    const { company, userId } = await requireCurrentCompany();
    const members = await listTeamMembers(company.clerkOrgId).catch(() => []);
    return { me: userId, members: members.map((m) => ({ userId: m.userId, name: m.name })) };
  });
}

const taskFields = z.object({
  title: z.string().trim().min(1, 'Dê um título à tarefa.').max(160),
  details: z.string().max(4000).nullish(),
  dueDate: dateKey.nullish(),
  dueTime: timeKey.nullish(),
  remindDate: dateKey.nullish(),
  remindTime: timeKey.nullish(),
  assignedUserId: z.string().max(64).nullish(),
  priority: priority.optional(),
  recurrence: z.enum(TASK_RECURRENCES).nullish(),
  clientId: id.nullish(),
  quoteId: id.nullish(),
  opportunityId: id.nullish(),
  appointmentId: id.nullish(),
  transactionId: id.nullish(),
  checklist: z
    .array(z.object({ text: z.string().max(200), done: z.boolean().optional() }))
    .max(30)
    .nullish(),
});

export async function createTaskAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = taskFields.parse(input);
    const { company, userId } = await requireCurrentCompany();
    await assertAssignee(company.clerkOrgId, parsed.assignedUserId);
    const { task } = await createTask(company.id, userId, {
      title: parsed.title,
      details: parsed.details,
      // Sem hora: fim do dia (23:59) no fuso da empresa.
      dueAt: toInstant(parsed.dueDate, parsed.dueTime, company.timezone, 23 * 60 + 59),
      remindAt: toInstant(parsed.remindDate, parsed.remindTime, company.timezone, 9 * 60),
      assignedUserId: parsed.assignedUserId ?? null,
      priority: parsed.priority,
      recurrence: parsed.recurrence ?? null,
      clientId: parsed.clientId,
      quoteId: parsed.quoteId,
      opportunityId: parsed.opportunityId,
      appointmentId: parsed.appointmentId,
      transactionId: parsed.transactionId,
      checklist: parsed.checklist,
    });
    return { id: task.id };
  });
}

export async function updateTaskAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = taskFields.partial().extend({ id }).parse(input);
    const { company, userId } = await requireCurrentCompany();
    await assertAssignee(company.clerkOrgId, parsed.assignedUserId);
    return updateTask(company.id, userId, parsed.id, {
      title: parsed.title,
      details: parsed.details,
      dueAt:
        parsed.dueDate === undefined
          ? undefined
          : toInstant(parsed.dueDate, parsed.dueTime, company.timezone, 23 * 60 + 59),
      remindAt:
        parsed.remindDate === undefined
          ? undefined
          : toInstant(parsed.remindDate, parsed.remindTime, company.timezone, 9 * 60),
      assignedUserId: parsed.assignedUserId,
      priority: parsed.priority,
      recurrence: parsed.recurrence,
      clientId: parsed.clientId,
      opportunityId: parsed.opportunityId,
    });
  });
}

export async function setTaskStatusAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ id, status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED']) })
      .parse(input);
    const { company, userId } = await requireCurrentCompany();
    return setTaskStatus(company.id, userId, parsed.id, parsed.status, company.timezone);
  });
}

export async function toggleTaskChecklistAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ id, itemId: z.string().min(1).max(20), done: z.boolean() })
      .parse(input);
    const { company, userId } = await requireCurrentCompany();
    return toggleChecklistItem(company.id, userId, parsed.id, parsed.itemId, parsed.done);
  });
}

export async function setTaskChecklistAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        id,
        items: z
          .array(
            z.object({
              id: z.string().max(20).optional(),
              text: z.string().max(200),
              done: z.boolean().optional(),
            }),
          )
          .max(30),
      })
      .parse(input);
    const { company, userId } = await requireCurrentCompany();
    await setChecklist(company.id, userId, parsed.id, parsed.items);
  });
}

export async function addTaskCommentAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, body: z.string().max(2000) }).parse(input);
    const { company, userId } = await requireCurrentCompany();
    const comment = await addTaskComment(company.id, userId, parsed.id, parsed.body);
    return { id: comment.id };
  });
}

const HISTORY_LABEL: Record<string, string> = {
  created: 'criou a tarefa',
  updated: 'alterou',
  completed: 'concluiu',
  canceled: 'cancelou',
  status_changed: 'mudou o status',
};

export async function getTaskDetailAction(rawId: unknown) {
  return toActionResult(async () => {
    const taskId = id.parse(rawId);
    const { company } = await requireCurrentCompany();
    const [{ task, history }, members] = await Promise.all([
      getTaskDetail(company.id, taskId),
      listTeamMembers(company.clerkOrgId).catch(() => []),
    ]);
    const nameOf = (uid: string) =>
      members.find((m) => m.userId === uid)?.name ??
      (uid === 'automation'
        ? 'Rotina automática'
        : uid.startsWith('user_')
          ? 'Pessoa da equipe'
          : 'Sistema');
    return {
      ...serialize({ ...task, _count: { comments: task.comments.length } }),
      comments: task.comments.map((c) => ({
        id: c.id,
        body: c.body,
        author: nameOf(c.userId),
        createdAt: c.createdAt.toISOString(),
      })),
      history: history.map((h) => ({
        id: h.id,
        text: `${nameOf(h.userId)} ${HISTORY_LABEL[h.action] ?? h.action}${
          h.action === 'updated' && h.metadata && typeof h.metadata === 'object'
            ? ` (${Object.keys(h.metadata as object)
                .map((k) => FIELD_LABEL[k] ?? k)
                .join(', ')})`
            : ''
        }`,
        at: h.createdAt.toISOString(),
      })),
    };
  });
}

const FIELD_LABEL: Record<string, string> = {
  title: 'título',
  details: 'descrição',
  dueAt: 'prazo',
  assignedUserId: 'responsável',
  priority: 'prioridade',
  remindAt: 'lembrete',
  recurrence: 'repetição',
  clientId: 'cliente',
  opportunityId: 'oportunidade',
  checklist: 'checklist',
  status: 'status',
  origin: 'origem',
};
