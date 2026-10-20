import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { OpportunityStageKind } from '@/generated/prisma/client';
import { normalizePhone } from '@/lib/phone';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  CRM de oportunidades (Profissional+).
  - Funil com etapas personalizáveis; "Ganho" e "Perdido" são etapas finais (kind WON/LOST).
  - Oportunidade com cliente cadastrado OU só o contato; se o telefone já é de um cliente, liga
    a ele em vez de duplicar. Virar cliente é uma ação explícita.
  - Valor estimado ≠ receita: nada financeiro nasce aqui.
  - Toda mudança de etapa é registrada; mover confere permissão e a etapa de origem (quem moveu
    antes ganha; o kanban não passa por cima de ninguém).
  - Ganhas e perdidas continuam no histórico (podem ser reabertas, com registro).
  - Quem edita/move: administrador, o responsável, ou qualquer pessoa se não houver responsável.
*/

export type CrmViewer = { userId: string; isAdmin: boolean };

const TX = { maxWait: 10_000, timeout: 20_000 };

export const DEFAULT_STAGES: { name: string; kind: OpportunityStageKind }[] = [
  { name: 'Novo contato', kind: 'OPEN' },
  { name: 'Em atendimento', kind: 'OPEN' },
  { name: 'Proposta enviada', kind: 'OPEN' },
  { name: 'Em negociação', kind: 'OPEN' },
  { name: 'Ganho', kind: 'WON' },
  { name: 'Perdido', kind: 'LOST' },
];

export const INTERACTION_KINDS = ['note', 'call', 'message', 'meeting', 'email'] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

/** Cria o funil padrão na primeira vez (uma vez só, mesmo com duas abas abertas). */
export async function ensureStages(companyId: string) {
  const count = await prisma.opportunityStage.count({ where: { companyId } });
  if (count > 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'crm-stages:' + companyId}))`;
    if ((await tx.opportunityStage.count({ where: { companyId } })) > 0) return;
    await tx.opportunityStage.createMany({
      data: DEFAULT_STAGES.map((s, position) => ({
        companyId,
        name: s.name,
        kind: s.kind,
        position,
      })),
    });
  }, TX);
}

export async function listStages(companyId: string, includeArchived = false) {
  await ensureStages(companyId);
  return prisma.opportunityStage.findMany({
    where: { companyId, ...(includeArchived ? {} : { archived: false }) },
    orderBy: { position: 'asc' },
  });
}

/**
 * Salva o funil (renomear, reordenar, criar, arquivar). Precisa de ao menos uma etapa aberta, uma
 * de ganho e uma de perda; etapa com oportunidades abertas não é arquivada (mova-as antes).
 */
export async function saveStages(
  companyId: string,
  userId: string,
  stages: { id?: string; name: string; kind: OpportunityStageKind; archived?: boolean }[],
) {
  const active = stages.filter((s) => !s.archived);
  if (!active.some((s) => s.kind === 'OPEN'))
    throw new UserError('Mantenha ao menos uma etapa em andamento.');
  if (!active.some((s) => s.kind === 'WON')) throw new UserError('Mantenha uma etapa de ganho.');
  if (!active.some((s) => s.kind === 'LOST')) throw new UserError('Mantenha uma etapa de perda.');
  if (stages.length > 20) throw new UserError('Até 20 etapas.');
  const names = active.map((s) => s.name.trim().toLowerCase());
  if (names.some((n) => !n)) throw new UserError('Dê nome a todas as etapas.');
  if (new Set(names).size !== names.length) throw new UserError('Há etapas com o mesmo nome.');
  await prisma.$transaction(async (tx) => {
    const existing = await tx.opportunityStage.findMany({ where: { companyId } });
    for (const [position, stage] of stages.entries()) {
      const name = stage.name.trim().slice(0, 60);
      if (stage.id) {
        const current = existing.find((e) => e.id === stage.id);
        if (!current) throw new UserError('Etapa não encontrada.');
        if (stage.archived && !current.archived) {
          const open = await tx.opportunity.count({
            where: { companyId, stageId: stage.id, status: 'OPEN' },
          });
          if (open > 0)
            throw new UserError(
              `A etapa "${current.name}" tem oportunidades abertas: mova-as antes de arquivar.`,
            );
        }
        // O tipo de uma etapa em uso não muda (oportunidades ganhas/perdidas dependem dele).
        if (current.kind !== stage.kind) {
          const used = await tx.opportunity.count({ where: { companyId, stageId: stage.id } });
          if (used > 0)
            throw new UserError(
              `O tipo da etapa "${current.name}" não muda porque ela já tem oportunidades.`,
            );
        }
        await tx.opportunityStage.update({
          where: { id: stage.id },
          data: { name, kind: stage.kind, position, archived: !!stage.archived },
        });
      } else {
        await tx.opportunityStage.create({ data: { companyId, name, kind: stage.kind, position } });
      }
    }
  }, TX);
  await recordAuditLog({
    companyId,
    entityType: 'OpportunityStage',
    entityId: companyId,
    action: 'updated',
    userId,
    metadata: { stages: stages.length },
  });
}

// ---- Oportunidades -----------------------------------------------------------------------------

export type OpportunityInput = {
  clientId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  title: string;
  source?: string | null;
  ownerUserId?: string | null;
  serviceIds?: string[];
  estimatedValue?: number | null;
  stageId?: string | null;
  nextAction?: string | null;
  nextActionAt?: Date | null;
  expectedCloseAt?: Date | null;
};

const include = {
  client: { select: { id: true, name: true, phone: true } },
  stage: { select: { id: true, name: true, kind: true, position: true } },
  _count: { select: { tasks: true, quotes: true, events: true } },
} satisfies Prisma.OpportunityInclude;

export type OpportunityRow = Prisma.OpportunityGetPayload<{ include: typeof include }>;

function canEdit(viewer: CrmViewer, opp: { ownerUserId: string | null }) {
  return viewer.isAdmin || !opp.ownerUserId || opp.ownerUserId === viewer.userId;
}

async function assertServices(companyId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length > 20) throw new UserError('Até 20 serviços de interesse.');
  if (!unique.length) return unique;
  const found = await prisma.service.count({ where: { companyId, id: { in: unique } } });
  if (found !== unique.length) throw new UserError('Serviço não encontrado.');
  return unique;
}

/** Cliente pelo telefone exato (sem duplicar quem já existe). */
async function clientByPhone(companyId: string, phone: string | null | undefined) {
  const digits = normalizePhone(phone);
  if (!digits || digits.length < 10) return null;
  return prisma.client.findFirst({ where: { companyId, phone: digits }, select: { id: true } });
}

export async function createOpportunity(
  companyId: string,
  userId: string,
  input: OpportunityInput,
) {
  const title = input.title.trim();
  if (!title || title.length > 160) throw new UserError('Dê um título curto à oportunidade.');
  let clientId = input.clientId ?? null;
  if (clientId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, companyId },
      select: { id: true },
    });
    if (!client) throw new UserError('Cliente não encontrado.');
  } else {
    if (!input.contactName?.trim() && !input.contactPhone?.trim()) {
      throw new UserError('Escolha um cliente ou informe o contato.');
    }
    clientId = (await clientByPhone(companyId, input.contactPhone))?.id ?? null;
  }
  if (
    input.estimatedValue != null &&
    (input.estimatedValue < 0 || input.estimatedValue > 100_000_000)
  ) {
    throw new UserError('Valor estimado inválido.');
  }
  const serviceIds = await assertServices(companyId, input.serviceIds ?? []);
  const stages = await listStages(companyId);
  const stage = input.stageId
    ? stages.find((s) => s.id === input.stageId)
    : stages.find((s) => s.kind === 'OPEN');
  if (!stage) throw new UserError('Etapa não encontrada.');
  if (stage.kind !== 'OPEN')
    throw new UserError('Uma oportunidade nova começa numa etapa em andamento.');
  const opp = await prisma.opportunity.create({
    data: {
      companyId,
      clientId,
      contactName: clientId ? null : input.contactName?.trim().slice(0, 120) || null,
      contactPhone: clientId ? null : (normalizePhone(input.contactPhone) ?? null),
      title,
      source: input.source?.trim().slice(0, 60) || null,
      ownerUserId: input.ownerUserId ?? null,
      serviceIds,
      estimatedValue: input.estimatedValue ?? null,
      stageId: stage.id,
      nextAction: input.nextAction?.trim().slice(0, 200) || null,
      nextActionAt: input.nextActionAt ?? null,
      expectedCloseAt: input.expectedCloseAt ?? null,
      createdByUserId: userId,
      events: { create: { companyId, kind: 'created', toStageId: stage.id, userId } },
    },
    include,
  });
  await recordAuditLog({
    companyId,
    entityType: 'Opportunity',
    entityId: opp.id,
    action: 'created',
    userId,
  });
  return opp;
}

async function loadForEdit(companyId: string, viewer: CrmViewer, id: string) {
  const opp = await prisma.opportunity.findFirst({ where: { id, companyId } });
  if (!opp) throw new UserError('Oportunidade não encontrada.');
  if (!canEdit(viewer, opp)) {
    throw new UserError(
      'Só o responsável por esta oportunidade (ou um administrador) pode alterá-la.',
    );
  }
  return opp;
}

export async function updateOpportunity(
  companyId: string,
  viewer: CrmViewer,
  id: string,
  patch: Partial<Omit<OpportunityInput, 'stageId'>>,
) {
  const opp = await loadForEdit(companyId, viewer, id);
  const data: Prisma.OpportunityUncheckedUpdateInput = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title || title.length > 160) throw new UserError('Dê um título curto à oportunidade.');
    data.title = title;
  }
  if (patch.clientId !== undefined && patch.clientId !== opp.clientId) {
    if (patch.clientId) {
      const client = await prisma.client.findFirst({
        where: { id: patch.clientId, companyId },
        select: { id: true },
      });
      if (!client) throw new UserError('Cliente não encontrado.');
    }
    data.clientId = patch.clientId;
  }
  if (patch.source !== undefined) data.source = patch.source?.trim().slice(0, 60) || null;
  if (patch.ownerUserId !== undefined) data.ownerUserId = patch.ownerUserId;
  if (patch.serviceIds !== undefined)
    data.serviceIds = await assertServices(companyId, patch.serviceIds);
  if (patch.estimatedValue !== undefined) {
    if (
      patch.estimatedValue != null &&
      (patch.estimatedValue < 0 || patch.estimatedValue > 100_000_000)
    ) {
      throw new UserError('Valor estimado inválido.');
    }
    data.estimatedValue = patch.estimatedValue;
  }
  if (patch.nextAction !== undefined)
    data.nextAction = patch.nextAction?.trim().slice(0, 200) || null;
  if (patch.nextActionAt !== undefined) data.nextActionAt = patch.nextActionAt;
  if (patch.expectedCloseAt !== undefined) data.expectedCloseAt = patch.expectedCloseAt;
  if (patch.contactName !== undefined)
    data.contactName = patch.contactName?.trim().slice(0, 120) || null;
  if (patch.contactPhone !== undefined)
    data.contactPhone = normalizePhone(patch.contactPhone) ?? null;
  await prisma.opportunity.update({ where: { id }, data });
  await recordAuditLog({
    companyId,
    entityType: 'Opportunity',
    entityId: id,
    action: 'updated',
    userId: viewer.userId,
    metadata: { fields: Object.keys(data) },
  });
}

/**
 * Move para outra etapa. `fromStageId` é a etapa que a pessoa via: se alguém moveu antes, recusa.
 * Perder exige motivo; ganhar/perder registra a data; voltar de ganho/perdido é "reabrir".
 */
export async function moveOpportunity(
  companyId: string,
  viewer: CrmViewer,
  id: string,
  params: { toStageId: string; fromStageId: string; lostReason?: string | null },
) {
  const opp = await loadForEdit(companyId, viewer, id);
  const stage = await prisma.opportunityStage.findFirst({
    where: { id: params.toStageId, companyId, archived: false },
  });
  if (!stage) throw new UserError('Etapa não encontrada.');
  if (stage.id === opp.stageId) return { moved: false };
  const lostReason = params.lostReason?.trim().slice(0, 300) || null;
  if (stage.kind === 'LOST' && !lostReason) throw new UserError('Informe o motivo da perda.');
  const now = new Date();
  const status = stage.kind === 'WON' ? 'WON' : stage.kind === 'LOST' ? 'LOST' : 'OPEN';
  const result = await prisma.opportunity.updateMany({
    where: { id, companyId, stageId: params.fromStageId },
    data: {
      stageId: stage.id,
      status,
      stageEnteredAt: now,
      wonAt: status === 'WON' ? now : null,
      lostAt: status === 'LOST' ? now : null,
      lostReason: status === 'LOST' ? lostReason : null,
    },
  });
  if (result.count === 0) {
    throw new UserError('Esta oportunidade foi movida por outra pessoa. Atualize a tela.');
  }
  const kind =
    status === 'WON'
      ? 'won'
      : status === 'LOST'
        ? 'lost'
        : opp.status !== 'OPEN'
          ? 'reopened'
          : 'stage_change';
  await prisma.opportunityEvent.create({
    data: {
      companyId,
      opportunityId: id,
      kind,
      body: status === 'LOST' ? lostReason : null,
      fromStageId: opp.stageId,
      toStageId: stage.id,
      userId: viewer.userId,
    },
  });
  await recordAuditLog({
    companyId,
    entityType: 'Opportunity',
    entityId: id,
    action: 'moved',
    userId: viewer.userId,
    metadata: { from: opp.stageId, to: stage.id, status },
  });
  return { moved: true, status };
}

export async function addInteraction(
  companyId: string,
  viewer: CrmViewer,
  id: string,
  kind: InteractionKind,
  body: string,
) {
  const opp = await prisma.opportunity.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!opp) throw new UserError('Oportunidade não encontrada.');
  const text = body.trim();
  if (!text) throw new UserError('Descreva a interação.');
  if (text.length > 2000) throw new UserError('Texto longo demais (até 2.000 caracteres).');
  return prisma.opportunityEvent.create({
    data: { companyId, opportunityId: id, kind, body: text, userId: viewer.userId },
  });
}

/**
 * Transforma o contato em cliente cadastrado. Se o telefone já é de um cliente, liga a ele (sem
 * duplicar).
 */
export async function convertContactToClient(companyId: string, viewer: CrmViewer, id: string) {
  const opp = await loadForEdit(companyId, viewer, id);
  if (opp.clientId) return { clientId: opp.clientId, created: false };
  const existing = await clientByPhone(companyId, opp.contactPhone);
  const clientId =
    existing?.id ??
    (
      await prisma.client.create({
        data: {
          companyId,
          name: opp.contactName?.trim() || opp.title,
          phone: normalizePhone(opp.contactPhone) ?? null,
        },
      })
    ).id;
  await prisma.opportunity.update({
    where: { id },
    data: { clientId, contactName: null, contactPhone: null },
  });
  return { clientId, created: !existing };
}

export type OpportunityFilter = {
  status?: 'OPEN' | 'WON' | 'LOST' | 'ALL';
  ownerUserId?: string | null;
  stageId?: string;
  clientId?: string;
  search?: string;
};

export async function listOpportunities(companyId: string, filter: OpportunityFilter = {}) {
  await ensureStages(companyId);
  const search = filter.search?.trim().slice(0, 80);
  return prisma.opportunity.findMany({
    where: {
      companyId,
      ...(filter.status && filter.status !== 'ALL' ? { status: filter.status } : {}),
      ...(filter.ownerUserId !== undefined ? { ownerUserId: filter.ownerUserId } : {}),
      ...(filter.stageId ? { stageId: filter.stageId } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { contactName: { contains: search, mode: 'insensitive' } },
              { client: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include,
    orderBy: [{ nextActionAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
    take: 500,
  });
}

export async function getOpportunityDetail(companyId: string, id: string) {
  const opp = await prisma.opportunity.findFirst({
    where: { id, companyId },
    include: {
      ...include,
      events: { orderBy: { createdAt: 'desc' }, take: 100 },
      tasks: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, title: true, status: true, dueAt: true },
      },
      quotes: {
        orderBy: { number: 'desc' },
        select: { id: true, number: true, title: true, status: true },
      },
    },
  });
  if (!opp) throw new UserError('Oportunidade não encontrada.');
  const services = opp.serviceIds.length
    ? await prisma.service.findMany({
        where: { companyId, id: { in: opp.serviceIds } },
        select: { id: true, name: true },
      })
    : [];
  const stages = await prisma.opportunityStage.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  return { opp, services, stageName: new Map(stages.map((s) => [s.id, s.name])) };
}

/** Liga um orçamento existente (do mesmo cliente) à oportunidade. */
export async function linkQuote(companyId: string, viewer: CrmViewer, id: string, quoteId: string) {
  const opp = await loadForEdit(companyId, viewer, id);
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, companyId },
    select: { id: true, clientId: true },
  });
  if (!quote) throw new UserError('Orçamento não encontrado.');
  if (opp.clientId && quote.clientId !== opp.clientId) {
    throw new UserError('O orçamento é de outro cliente.');
  }
  await prisma.quote.update({ where: { id: quote.id }, data: { opportunityId: id } });
  await prisma.opportunityEvent.create({
    data: {
      companyId,
      opportunityId: id,
      kind: 'note',
      body: 'Orçamento vinculado.',
      userId: viewer.userId,
    },
  });
}

export { canEdit as canEditOpportunity };
