import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { JobStageKind } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Serviços em andamento (Pro): trabalhos com várias etapas (obra, projeto, tratamento, reparo...).
  - Etapas personalizáveis; Concluído e Cancelado encerram.
  - Não substitui a agenda: horários marcados são LIGADOS ao serviço.
  - Não mexe no financeiro: concluir não é receber, mudar de etapa não gera venda.
  - Vindo de orçamento aprovado: uma vez só (mesma transação marca o orçamento).
  - Na área do cliente aparece só o que a equipe ligar: título, etapa e uma mensagem.
  - Quem altera: administrador, responsável, colaboradores, ou qualquer um se não houver responsável.
*/

export type JobViewer = { userId: string; isAdmin: boolean };
const TX = { maxWait: 10_000, timeout: 20_000 };

export const DEFAULT_JOB_STAGES: { name: string; kind: JobStageKind }[] = [
  { name: 'Solicitado', kind: 'OPEN' },
  { name: 'Orçado', kind: 'OPEN' },
  { name: 'Aprovado', kind: 'OPEN' },
  { name: 'Em execução', kind: 'OPEN' },
  { name: 'Aguardando cliente', kind: 'OPEN' },
  { name: 'Concluído', kind: 'DONE' },
  { name: 'Cancelado', kind: 'CANCELED' },
];

export async function listJobStages(companyId: string) {
  const count = await prisma.jobStage.count({ where: { companyId } });
  if (count === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'job-stages:' + companyId}))`;
      if ((await tx.jobStage.count({ where: { companyId } })) > 0) return;
      await tx.jobStage.createMany({
        data: DEFAULT_JOB_STAGES.map((s, position) => ({
          companyId,
          name: s.name,
          kind: s.kind,
          position,
        })),
      });
    }, TX);
  }
  return prisma.jobStage.findMany({
    where: { companyId, archived: false },
    orderBy: { position: 'asc' },
  });
}

export async function saveJobStages(
  companyId: string,
  userId: string,
  stages: { id?: string; name: string; kind: JobStageKind; archived?: boolean }[],
) {
  const active = stages.filter((s) => !s.archived);
  if (!active.some((s) => s.kind === 'OPEN'))
    throw new UserError('Mantenha ao menos uma etapa em andamento.');
  if (!active.some((s) => s.kind === 'DONE'))
    throw new UserError('Mantenha uma etapa de conclusão.');
  if (!active.some((s) => s.kind === 'CANCELED'))
    throw new UserError('Mantenha uma etapa de cancelamento.');
  if (stages.length > 20) throw new UserError('Até 20 etapas.');
  await prisma.$transaction(async (tx) => {
    const existing = await tx.jobStage.findMany({ where: { companyId } });
    for (const [position, stage] of stages.entries()) {
      const name = stage.name.trim().slice(0, 60);
      if (!name) throw new UserError('Dê nome a todas as etapas.');
      if (stage.id) {
        const current = existing.find((e) => e.id === stage.id);
        if (!current) throw new UserError('Etapa não encontrada.');
        const inUse = await tx.job.count({ where: { companyId, stageId: stage.id } });
        if (stage.archived && inUse && !current.archived) {
          const open = await tx.job.count({
            where: { companyId, stageId: stage.id, completedAt: null, canceledAt: null },
          });
          if (open)
            throw new UserError(
              `A etapa "${current.name}" tem serviços em andamento: mova-os antes.`,
            );
        }
        if (current.kind !== stage.kind && inUse) {
          throw new UserError(
            `O tipo da etapa "${current.name}" não muda porque ela já tem serviços.`,
          );
        }
        await tx.jobStage.update({
          where: { id: stage.id },
          data: { name, kind: stage.kind, position, archived: !!stage.archived },
        });
      } else {
        await tx.jobStage.create({ data: { companyId, name, kind: stage.kind, position } });
      }
    }
  }, TX);
  await recordAuditLog({
    companyId,
    entityType: 'JobStage',
    entityId: companyId,
    action: 'updated',
    userId,
  });
}

export type JobInput = {
  clientId: string;
  title: string;
  description?: string | null;
  ownerUserId?: string | null;
  collaboratorIds?: string[];
  dueAt?: Date | null;
  checklist?: { text: string }[];
  stageId?: string | null;
};

function canEdit(
  viewer: JobViewer,
  job: { ownerUserId: string | null; collaboratorIds: string[] },
) {
  return (
    viewer.isAdmin ||
    !job.ownerUserId ||
    job.ownerUserId === viewer.userId ||
    job.collaboratorIds.includes(viewer.userId)
  );
}

const checklistOf = (items: { text: string }[] | undefined) =>
  (items ?? [])
    .map((i) => ({ id: randomUUID().slice(0, 8), text: i.text.trim().slice(0, 200), done: false }))
    .filter((i) => i.text)
    .slice(0, 50);

async function createInTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  userId: string,
  input: JobInput & { quoteId?: string | null },
) {
  const title = input.title.trim();
  if (!title || title.length > 160) throw new UserError('Dê um título curto ao serviço.');
  const client = await tx.client.findFirst({
    where: { id: input.clientId, companyId },
    select: { id: true },
  });
  if (!client) throw new UserError('Cliente não encontrado.');
  const stages = await tx.jobStage.findMany({
    where: { companyId, archived: false },
    orderBy: { position: 'asc' },
  });
  const stage = input.stageId
    ? stages.find((s) => s.id === input.stageId)
    : stages.find((s) => s.kind === 'OPEN');
  if (!stage || stage.kind !== 'OPEN') throw new UserError('Escolha uma etapa em andamento.');
  return tx.job.create({
    data: {
      companyId,
      clientId: client.id,
      title,
      description: input.description?.trim().slice(0, 4000) || null,
      quoteId: input.quoteId ?? null,
      stageId: stage.id,
      ownerUserId: input.ownerUserId ?? null,
      collaboratorIds: [...new Set(input.collaboratorIds ?? [])].slice(0, 20),
      dueAt: input.dueAt ?? null,
      checklist: checklistOf(input.checklist),
      createdByUserId: userId,
      events: { create: { companyId, kind: 'created', toStageId: stage.id, userId } },
    },
  });
}

export async function createJob(companyId: string, userId: string, input: JobInput) {
  await listJobStages(companyId);
  const job = await prisma.$transaction((tx) => createInTx(tx, companyId, userId, input), TX);
  await recordAuditLog({
    companyId,
    entityType: 'Job',
    entityId: job.id,
    action: 'created',
    userId,
  });
  return job;
}

/** Orçamento aprovado → serviço em andamento, uma vez só. Nada financeiro é criado. */
export async function convertQuoteToJob(companyId: string, userId: string, quoteId: string) {
  const stages = await listJobStages(companyId);
  const approvedStage =
    stages.find((s) => s.kind === 'OPEN' && s.name.toLowerCase() === 'aprovado') ??
    stages.find((s) => s.kind === 'OPEN');
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Quote" WHERE id = ${quoteId} AND "companyId" = ${companyId} FOR UPDATE`;
    if (!rows.length) throw new UserError('Orçamento não encontrado.');
    const quote = await tx.quote.findUniqueOrThrow({ where: { id: quoteId } });
    if (quote.convertedAt) throw new UserError('Este orçamento já foi convertido.');
    if (quote.status !== 'APPROVED' || quote.approvedVersion !== quote.currentVersion) {
      throw new UserError('Só a versão aprovada pode virar serviço em andamento.');
    }
    const version = await tx.quoteVersion.findUniqueOrThrow({
      where: { quoteId_version: { quoteId, version: quote.currentVersion } },
    });
    const items = version.items as { description: string }[];
    const job = await createInTx(tx, companyId, userId, {
      clientId: quote.clientId,
      title: quote.title,
      description: `Do orçamento #${quote.number} (versão ${version.version}).`,
      quoteId: quote.id,
      stageId: approvedStage?.id,
      checklist: items.map((i) => ({ text: i.description })),
    });
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        convertedAt: new Date(),
        convertedKind: 'job',
        convertedRefId: job.id,
        convertedByUserId: userId,
      },
    });
    await recordAuditLog(
      {
        companyId,
        entityType: 'Quote',
        entityId: quote.id,
        action: 'converted',
        userId,
        metadata: { kind: 'job', jobId: job.id },
      },
      tx,
    );
    return job;
  }, TX);
}

async function loadForEdit(companyId: string, viewer: JobViewer, id: string) {
  const job = await prisma.job.findFirst({ where: { id, companyId } });
  if (!job) throw new UserError('Serviço não encontrado.');
  if (!canEdit(viewer, job))
    throw new UserError(
      'Só o responsável, os colaboradores ou um administrador alteram este serviço.',
    );
  return job;
}

/** Muda de etapa conferindo a etapa que a pessoa via (quem moveu antes ganha). */
export async function moveJob(
  companyId: string,
  viewer: JobViewer,
  id: string,
  params: { toStageId: string; fromStageId: string },
) {
  const job = await loadForEdit(companyId, viewer, id);
  const stage = await prisma.jobStage.findFirst({
    where: { id: params.toStageId, companyId, archived: false },
  });
  if (!stage) throw new UserError('Etapa não encontrada.');
  if (stage.id === job.stageId) return { moved: false };
  const now = new Date();
  const result = await prisma.job.updateMany({
    where: { id, companyId, stageId: params.fromStageId },
    data: {
      stageId: stage.id,
      stageEnteredAt: now,
      completedAt: stage.kind === 'DONE' ? now : null,
      canceledAt: stage.kind === 'CANCELED' ? now : null,
    },
  });
  if (!result.count)
    throw new UserError('Este serviço foi movido por outra pessoa. Atualize a tela.');
  await prisma.jobEvent.create({
    data: {
      companyId,
      jobId: id,
      kind: 'stage_change',
      fromStageId: job.stageId,
      toStageId: stage.id,
      userId: viewer.userId,
    },
  });
  await recordAuditLog({
    companyId,
    entityType: 'Job',
    entityId: id,
    action: 'moved',
    userId: viewer.userId,
    metadata: { to: stage.id },
  });
  return { moved: true, kind: stage.kind };
}

export async function updateJob(
  companyId: string,
  viewer: JobViewer,
  id: string,
  patch: Partial<Omit<JobInput, 'clientId' | 'stageId' | 'checklist'>> & {
    portalVisible?: boolean;
    portalNote?: string | null;
  },
) {
  await loadForEdit(companyId, viewer, id);
  const data: Prisma.JobUncheckedUpdateInput = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title || title.length > 160) throw new UserError('Dê um título curto ao serviço.');
    data.title = title;
  }
  if (patch.description !== undefined)
    data.description = patch.description?.trim().slice(0, 4000) || null;
  if (patch.ownerUserId !== undefined) data.ownerUserId = patch.ownerUserId;
  if (patch.collaboratorIds !== undefined)
    data.collaboratorIds = [...new Set(patch.collaboratorIds)].slice(0, 20);
  if (patch.dueAt !== undefined) data.dueAt = patch.dueAt;
  if (patch.portalVisible !== undefined) data.portalVisible = patch.portalVisible;
  if (patch.portalNote !== undefined)
    data.portalNote = patch.portalNote?.trim().slice(0, 500) || null;
  await prisma.job.update({ where: { id }, data });
  await prisma.jobEvent.create({
    data: {
      companyId,
      jobId: id,
      kind: 'updated',
      body: Object.keys(data).join(', '),
      userId: viewer.userId,
    },
  });
}

export async function addJobComment(
  companyId: string,
  viewer: JobViewer,
  id: string,
  body: string,
) {
  const job = await prisma.job.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!job) throw new UserError('Serviço não encontrado.');
  const text = body.trim();
  if (!text || text.length > 2000) throw new UserError('Comentário vazio ou longo demais.');
  await prisma.jobEvent.create({
    data: { companyId, jobId: id, kind: 'comment', body: text, userId: viewer.userId },
  });
}

export async function toggleJobChecklist(
  companyId: string,
  viewer: JobViewer,
  id: string,
  itemId: string,
  done: boolean,
) {
  await loadForEdit(companyId, viewer, id);
  await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<
      { checklist: unknown }[]
    >`SELECT checklist FROM "Job" WHERE id = ${id} FOR UPDATE`;
    const items = (row?.checklist ?? []) as { id: string; text: string; done: boolean }[];
    if (!items.some((i) => i.id === itemId)) throw new UserError('Item não encontrado.');
    await tx.job.update({
      where: { id },
      data: { checklist: items.map((i) => (i.id === itemId ? { ...i, done } : i)) },
    });
  });
}

/** Liga um agendamento (do mesmo cliente) ao serviço — a agenda continua sendo a fonte do horário. */
export async function linkAppointment(
  companyId: string,
  viewer: JobViewer,
  id: string,
  appointmentId: string,
) {
  const job = await loadForEdit(companyId, viewer, id);
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, companyId },
    select: { id: true, clientId: true },
  });
  if (!appointment) throw new UserError('Agendamento não encontrado.');
  if (appointment.clientId !== job.clientId)
    throw new UserError('O agendamento é de outro cliente.');
  await prisma.appointment.update({ where: { id: appointment.id }, data: { jobId: job.id } });
  await prisma.jobEvent.create({
    data: { companyId, jobId: id, kind: 'appointment_linked', userId: viewer.userId },
  });
}

export async function listJobs(
  companyId: string,
  filter: { open?: boolean; ownerUserId?: string; clientId?: string } = {},
) {
  await listJobStages(companyId);
  return prisma.job.findMany({
    where: {
      companyId,
      ...(filter.open === false ? {} : { completedAt: null, canceledAt: null }),
      ...(filter.ownerUserId ? { ownerUserId: filter.ownerUserId } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      stage: { select: { id: true, name: true, kind: true } },
    },
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
    take: 300,
  });
}

export async function getJobDetail(companyId: string, id: string) {
  const job = await prisma.job.findFirst({
    where: { id, companyId },
    include: {
      client: { select: { id: true, name: true } },
      stage: { select: { id: true, name: true, kind: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 100 },
      appointments: {
        select: { id: true, startAt: true, status: true, serviceNameSnapshot: true },
        orderBy: { startAt: 'asc' },
      },
    },
  });
  if (!job) throw new UserError('Serviço não encontrado.');
  return job;
}

/** O que o cliente vê na área do cliente: só serviços liberados, sem notas internas. */
export async function listClientJobs(companyId: string, clientId: string) {
  const jobs = await prisma.job.findMany({
    where: { companyId, clientId, portalVisible: true, canceledAt: null },
    select: {
      id: true,
      title: true,
      dueAt: true,
      portalNote: true,
      completedAt: true,
      stage: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  return jobs.map((j) => ({
    id: j.id,
    title: j.title,
    stage: j.stage.name,
    note: j.portalNote,
    dueAt: j.dueAt?.toISOString() ?? null,
    done: Boolean(j.completedAt),
  }));
}

export { canEdit as canEditJob };
