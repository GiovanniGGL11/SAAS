'use server';

import { z } from 'zod';

import { calendarDateToUtc } from '@/lib/time';
import { toActionResult } from '@/server/action-result';
import { UserError } from '@/server/errors';
import {
  isCompanyAdmin,
  requireCompanyAdmin,
  requireCurrentCompany,
} from '@/server/auth/require-current-company';
import { assertFeature } from '@/server/billing/features';
import { assertTeamMember } from '@/server/team';
import { createTask } from '@/server/data/tasks';
import {
  INTERACTION_KINDS,
  addInteraction,
  canEditOpportunity,
  convertContactToClient,
  createOpportunity,
  getOpportunityDetail,
  linkQuote,
  listOpportunities,
  listStages,
  moveOpportunity,
  saveStages,
  updateOpportunity,
} from '@/server/data/crm';

/*
  CRM (plano Profissional em diante). O plano e as permissões são conferidos em cada ação:
  arrastar no kanban é só a tela pedindo — quem decide é o servidor.
*/

const id = z.string().min(1).max(64);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function session() {
  const s = await requireCurrentCompany();
  assertFeature(s.company, 'crm');
  return { ...s, viewer: { userId: s.userId, isAdmin: isCompanyAdmin(s) } };
}

function localDate(value: string | null | undefined, timezone: string, minutes = 12 * 60) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return calendarDateToUtc({ year: y, month: m, day: d }, minutes, timezone);
}

async function assertOwner(clerkOrgId: string, ownerUserId: string | null | undefined) {
  if (ownerUserId && !(await assertTeamMember(clerkOrgId, ownerUserId))) {
    throw new UserError('Responsável não faz parte da equipe.');
  }
}

export async function listStagesAction() {
  return toActionResult(async () => {
    const { company } = await session();
    const stages = await listStages(company.id);
    return stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }));
  });
}

export async function saveStagesAction(input: unknown) {
  return toActionResult(async () => {
    const stages = z
      .array(
        z.object({
          id: id.optional(),
          name: z.string().max(60),
          kind: z.enum(['OPEN', 'WON', 'LOST']),
          archived: z.boolean().optional(),
        }),
      )
      .max(20)
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    assertFeature(company, 'crm');
    await saveStages(company.id, userId, stages);
  });
}

export async function listOpportunitiesAction(input: unknown) {
  return toActionResult(async () => {
    const filter = z
      .object({
        status: z.enum(['OPEN', 'WON', 'LOST', 'ALL']).optional(),
        owner: z.string().max(64).optional(),
        search: z.string().max(80).optional(),
        clientId: z.string().max(64).optional(),
      })
      .parse(input ?? {});
    const { company, viewer } = await session();
    const rows = await listOpportunities(company.id, {
      status: filter.status ?? 'OPEN',
      ownerUserId:
        filter.owner === 'me'
          ? viewer.userId
          : filter.owner === 'none'
            ? null
            : filter.owner || undefined,
      search: filter.search,
      clientId: filter.clientId,
    });
    return rows.map((o) => ({
      id: o.id,
      title: o.title,
      client: o.client,
      contactName: o.contactName,
      stageId: o.stageId,
      stage: o.stage,
      status: o.status,
      ownerUserId: o.ownerUserId,
      estimatedValue: o.estimatedValue == null ? null : Number(o.estimatedValue),
      nextAction: o.nextAction,
      nextActionAt: o.nextActionAt?.toISOString() ?? null,
      expectedCloseAt: o.expectedCloseAt?.toISOString() ?? null,
      source: o.source,
      lostReason: o.lostReason,
      updatedAt: o.updatedAt.toISOString(),
      canEdit: canEditOpportunity(viewer, o),
      counts: o._count,
    }));
  });
}

const oppFields = z.object({
  clientId: id.nullish(),
  contactName: z.string().max(120).nullish(),
  contactPhone: z.string().max(30).nullish(),
  title: z.string().trim().min(1, 'Dê um título.').max(160),
  source: z.string().max(60).nullish(),
  ownerUserId: z.string().max(64).nullish(),
  serviceIds: z.array(id).max(20).optional(),
  estimatedValue: z.number().min(0).max(100_000_000).nullish(),
  stageId: id.nullish(),
  nextAction: z.string().max(200).nullish(),
  nextActionDate: dateKey.nullish(),
  expectedCloseDate: dateKey.nullish(),
});

export async function createOpportunityAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = oppFields.parse(input);
    const { company, userId } = await session();
    await assertOwner(company.clerkOrgId, parsed.ownerUserId);
    const opp = await createOpportunity(company.id, userId, {
      ...parsed,
      nextActionAt: localDate(parsed.nextActionDate, company.timezone, 9 * 60),
      expectedCloseAt: localDate(parsed.expectedCloseDate, company.timezone),
    });
    return { id: opp.id };
  });
}

export async function updateOpportunityAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = oppFields.partial().extend({ id }).parse(input);
    const { company, viewer } = await session();
    await assertOwner(company.clerkOrgId, parsed.ownerUserId);
    const { id: oppId, nextActionDate, expectedCloseDate, stageId: _ignored, ...rest } = parsed;
    void _ignored;
    await updateOpportunity(company.id, viewer, oppId, {
      ...rest,
      nextActionAt:
        nextActionDate === undefined
          ? undefined
          : localDate(nextActionDate, company.timezone, 9 * 60),
      expectedCloseAt:
        expectedCloseDate === undefined
          ? undefined
          : localDate(expectedCloseDate, company.timezone),
    });
  });
}

export async function moveOpportunityAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ id, toStageId: id, fromStageId: id, lostReason: z.string().max(300).nullish() })
      .parse(input);
    const { company, viewer } = await session();
    return moveOpportunity(company.id, viewer, parsed.id, parsed);
  });
}

export async function addInteractionAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ id, kind: z.enum(INTERACTION_KINDS), body: z.string().max(2000) })
      .parse(input);
    const { company, viewer } = await session();
    await addInteraction(company.id, viewer, parsed.id, parsed.kind, parsed.body);
  });
}

export async function convertContactAction(rawId: unknown) {
  return toActionResult(async () => {
    const oppId = id.parse(rawId);
    const { company, viewer } = await session();
    return convertContactToClient(company.id, viewer, oppId);
  });
}

export async function linkQuoteAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, quoteId: id }).parse(input);
    const { company, viewer } = await session();
    assertFeature(company, 'quotes');
    await linkQuote(company.id, viewer, parsed.id, parsed.quoteId);
  });
}

/** Tarefa de retorno ligada à oportunidade (e ao cliente, se houver). */
export async function createFollowUpTaskAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ id, title: z.string().max(160).nullish(), dueDate: dateKey.nullish() })
      .parse(input);
    const { company, userId } = await session();
    const { opp } = await getOpportunityDetail(company.id, parsed.id);
    const { task } = await createTask(company.id, userId, {
      title: parsed.title?.trim() || `Retornar: ${opp.title}`,
      opportunityId: opp.id,
      clientId: opp.clientId,
      assignedUserId: opp.ownerUserId ?? userId,
      dueAt: localDate(parsed.dueDate, company.timezone, 9 * 60),
    });
    return { id: task.id };
  });
}

const EVENT_LABEL: Record<string, string> = {
  created: 'Criada',
  stage_change: 'Mudou de etapa',
  won: 'Ganha',
  lost: 'Perdida',
  reopened: 'Reaberta',
  note: 'Anotação',
  call: 'Ligação',
  message: 'Mensagem',
  meeting: 'Reunião',
  email: 'E-mail',
};

export async function getOpportunityAction(rawId: unknown) {
  return toActionResult(async () => {
    const oppId = id.parse(rawId);
    const { company, viewer } = await session();
    const { opp, services, stageName } = await getOpportunityDetail(company.id, oppId);
    return {
      id: opp.id,
      title: opp.title,
      client: opp.client,
      contactName: opp.contactName,
      contactPhone: opp.contactPhone,
      source: opp.source,
      ownerUserId: opp.ownerUserId,
      services,
      estimatedValue: opp.estimatedValue == null ? null : Number(opp.estimatedValue),
      stage: opp.stage,
      status: opp.status,
      nextAction: opp.nextAction,
      nextActionAt: opp.nextActionAt?.toISOString() ?? null,
      expectedCloseAt: opp.expectedCloseAt?.toISOString() ?? null,
      lostReason: opp.lostReason,
      createdAt: opp.createdAt.toISOString(),
      canEdit: canEditOpportunity(viewer, opp),
      tasks: opp.tasks.map((t) => ({ ...t, dueAt: t.dueAt?.toISOString() ?? null })),
      quotes: opp.quotes,
      events: opp.events.map((e) => ({
        id: e.id,
        label: EVENT_LABEL[e.kind] ?? e.kind,
        kind: e.kind,
        body: e.body,
        from: e.fromStageId ? (stageName.get(e.fromStageId) ?? null) : null,
        to: e.toStageId ? (stageName.get(e.toStageId) ?? null) : null,
        userId: e.userId,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });
}
