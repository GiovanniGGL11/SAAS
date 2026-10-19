'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { createTask, listTasks, setTaskStatus } from '@/server/data/tasks';

export async function listTasksAction(input: unknown) {
  return toActionResult(async () => {
    const filter = z
      .object({
        status: z.enum(['OPEN', 'DONE', 'CANCELED']).optional(),
        clientId: z.string().max(64).optional(),
      })
      .parse(input ?? {});
    const { company } = await requireCurrentCompany();
    const tasks = await listTasks(company.id, filter);
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      details: t.details,
      dueAt: t.dueAt?.toISOString() ?? null,
      status: t.status,
      origin: t.origin,
      client: t.client,
      quote: t.quote,
      clientPackageId: t.clientPackageId,
    }));
  });
}

export async function createTaskAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        title: z.string().trim().min(1).max(160),
        dueAt: z.coerce.date().nullish(),
        clientId: z.string().max(64).nullish(),
      })
      .parse(input);
    const { company, userId } = await requireCurrentCompany();
    const { task } = await createTask(company.id, userId, {
      title: parsed.title,
      dueAt: parsed.dueAt ?? null,
      clientId: parsed.clientId ?? null,
    });
    return { id: task.id };
  });
}

export async function setTaskStatusAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ id: z.string().min(1).max(64), status: z.enum(['OPEN', 'DONE', 'CANCELED']) })
      .parse(input);
    const { company, userId } = await requireCurrentCompany();
    await setTaskStatus(company.id, userId, parsed.id, parsed.status);
  });
}
