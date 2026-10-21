'use server';

import { z } from 'zod';

import { calendarDateToUtc } from '@/lib/time';
import { toActionResult } from '@/server/action-result';
import {
  isCompanyAdmin,
  requireCompanyAdmin,
  requireCurrentCompany,
} from '@/server/auth/require-current-company';
import { assertFeature } from '@/server/billing/features';
import {
  addJobComment,
  canEditJob,
  convertQuoteToJob,
  createJob,
  getJobDetail,
  linkAppointment,
  listJobStages,
  listJobs,
  moveJob,
  saveJobStages,
  toggleJobChecklist,
  updateJob,
} from '@/server/data/jobs';

/* Serviços em andamento — plano Pro, conferido em cada ação. */

const id = z.string().min(1).max(64);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function session() {
  const s = await requireCurrentCompany();
  assertFeature(s.company, 'serviceTracking');
  return { ...s, viewer: { userId: s.userId, isAdmin: isCompanyAdmin(s) } };
}

const toDue = (d: string | null | undefined, tz: string) => {
  if (!d) return null;
  const [y, m, day] = d.split('-').map(Number);
  return calendarDateToUtc({ year: y, month: m, day }, 18 * 60, tz);
};

export async function listJobStagesAction() {
  return toActionResult(async () => {
    const { company } = await session();
    return (await listJobStages(company.id)).map((s) => ({ id: s.id, name: s.name, kind: s.kind }));
  });
}

export async function saveJobStagesAction(input: unknown) {
  return toActionResult(async () => {
    const stages = z
      .array(
        z.object({
          id: id.optional(),
          name: z.string().max(60),
          kind: z.enum(['OPEN', 'DONE', 'CANCELED']),
          archived: z.boolean().optional(),
        }),
      )
      .max(20)
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    assertFeature(company, 'serviceTracking');
    await saveJobStages(company.id, userId, stages);
  });
}

export async function listJobsAction(input: unknown) {
  return toActionResult(async () => {
    const f = z
      .object({ open: z.boolean().optional(), mine: z.boolean().optional() })
      .parse(input ?? {});
    const { company, viewer } = await session();
    const jobs = await listJobs(company.id, {
      open: f.open,
      ownerUserId: f.mine ? viewer.userId : undefined,
    });
    return jobs.map((j) => ({
      id: j.id,
      title: j.title,
      client: j.client,
      stage: j.stage,
      stageId: j.stageId,
      ownerUserId: j.ownerUserId,
      dueAt: j.dueAt?.toISOString() ?? null,
      checklist: (j.checklist ?? []) as { id: string; text: string; done: boolean }[],
      portalVisible: j.portalVisible,
      canEdit: canEditJob(viewer, j),
    }));
  });
}

export async function createJobAction(input: unknown) {
  return toActionResult(async () => {
    const p = z
      .object({
        clientId: id,
        title: z.string().max(160),
        description: z.string().max(4000).nullish(),
        ownerUserId: z.string().max(64).nullish(),
        dueDate: dateKey.nullish(),
        checklist: z
          .array(z.object({ text: z.string().max(200) }))
          .max(50)
          .optional(),
      })
      .parse(input);
    const { company, userId } = await session();
    const job = await createJob(company.id, userId, {
      ...p,
      dueAt: toDue(p.dueDate, company.timezone),
    });
    return { id: job.id };
  });
}

export async function convertQuoteToJobAction(rawId: unknown) {
  return toActionResult(async () => {
    const quoteId = id.parse(rawId);
    const { company, userId } = await session();
    assertFeature(company, 'quotes');
    const job = await convertQuoteToJob(company.id, userId, quoteId);
    return { id: job.id };
  });
}

export async function moveJobAction(input: unknown) {
  return toActionResult(async () => {
    const p = z.object({ id, toStageId: id, fromStageId: id }).parse(input);
    const { company, viewer } = await session();
    return moveJob(company.id, viewer, p.id, p);
  });
}

export async function updateJobAction(input: unknown) {
  return toActionResult(async () => {
    const p = z
      .object({
        id,
        title: z.string().max(160).optional(),
        description: z.string().max(4000).nullish(),
        ownerUserId: z.string().max(64).nullish(),
        dueDate: dateKey.nullish(),
        portalVisible: z.boolean().optional(),
        portalNote: z.string().max(500).nullish(),
      })
      .parse(input);
    const { company, viewer } = await session();
    const { id: jobId, dueDate, ...rest } = p;
    await updateJob(company.id, viewer, jobId, {
      ...rest,
      dueAt: dueDate === undefined ? undefined : toDue(dueDate, company.timezone),
    });
  });
}

export async function addJobCommentAction(input: unknown) {
  return toActionResult(async () => {
    const p = z.object({ id, body: z.string().max(2000) }).parse(input);
    const { company, viewer } = await session();
    await addJobComment(company.id, viewer, p.id, p.body);
  });
}

export async function toggleJobChecklistAction(input: unknown) {
  return toActionResult(async () => {
    const p = z.object({ id, itemId: z.string().max(20), done: z.boolean() }).parse(input);
    const { company, viewer } = await session();
    await toggleJobChecklist(company.id, viewer, p.id, p.itemId, p.done);
  });
}

export async function linkJobAppointmentAction(input: unknown) {
  return toActionResult(async () => {
    const p = z.object({ id, appointmentId: id }).parse(input);
    const { company, viewer } = await session();
    await linkAppointment(company.id, viewer, p.id, p.appointmentId);
  });
}

export async function getJobAction(rawId: unknown) {
  return toActionResult(async () => {
    const jobId = id.parse(rawId);
    const { company, viewer } = await session();
    const job = await getJobDetail(company.id, jobId);
    const stages = await listJobStages(company.id);
    const name = new Map(stages.map((s) => [s.id, s.name]));
    return {
      id: job.id,
      title: job.title,
      description: job.description,
      client: job.client,
      stage: job.stage,
      ownerUserId: job.ownerUserId,
      dueAt: job.dueAt?.toISOString() ?? null,
      checklist: (job.checklist ?? []) as { id: string; text: string; done: boolean }[],
      portalVisible: job.portalVisible,
      portalNote: job.portalNote,
      quoteId: job.quoteId,
      canEdit: canEditJob(viewer, job),
      appointments: job.appointments.map((a) => ({ ...a, startAt: a.startAt.toISOString() })),
      events: job.events.map((e) => ({
        id: e.id,
        kind: e.kind,
        body: e.body,
        from: e.fromStageId ? (name.get(e.fromStageId) ?? null) : null,
        to: e.toStageId ? (name.get(e.toStageId) ?? null) : null,
        userId: e.userId,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });
}

/** Horários do cliente do serviço que ainda não estão ligados a ele (para "ligar agendamento"). */
export async function listLinkableAppointmentsAction(rawId: unknown) {
  return toActionResult(async () => {
    const jobId = id.parse(rawId);
    const { company } = await session();
    const job = await getJobDetail(company.id, jobId);
    const { prisma } = await import('@/lib/db');
    const rows = await prisma.appointment.findMany({
      where: {
        companyId: company.id,
        clientId: job.client.id,
        status: { not: 'CANCELED' },
        OR: [{ jobId: null }, { jobId: { not: jobId } }],
        startAt: { gte: new Date(Date.now() - 60 * 86_400_000) },
      },
      select: { id: true, startAt: true, serviceNameSnapshot: true },
      orderBy: { startAt: 'asc' },
      take: 30,
    });
    return rows.map((r) => ({ ...r, startAt: r.startAt.toISOString() }));
  });
}
