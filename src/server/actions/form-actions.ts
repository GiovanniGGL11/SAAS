'use server';

import { z } from 'zod';

import { prisma } from '@/lib/db';
import { listTeamMembers } from '@/server/team';
import { toActionResult } from '@/server/action-result';
import { UserError, parseId } from '@/server/errors';
import { appBaseUrl } from '@/server/app-url';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { requireFormAccess } from '@/server/auth/form-access';
import { requireAccess } from '@/server/data/form-permissions';
import { listFormPermissions, setFormPermission } from '@/server/data/form-permissions';
import { actorNames } from '@/server/data/audit-history';
import { systemActorLabel } from '@/lib/audit-describe';
import {
  FORM_LINK_DAYS,
  createEntryLink,
  createStarterAnamnesis,
  duplicateTemplate,
  getAppointmentForms,
  getEntryDetail,
  getEntryRevision,
  getTemplate,
  listClientEntries,
  listEntries,
  listEntryAudit,
  listTemplates,
  requestEntry,
  requestEntryUpdate,
  reviewEntry,
  revokeEntryLinks,
  saveEntryDraft,
  saveTemplate,
  setTemplateArchived,
  submitEntry,
  setEntryReleasedToClient,
} from '@/server/data/forms';

/*
  Ações da equipe para fichas. Toda checagem de permissão acontece na camada de dados (com a
  FormAccess resolvida aqui no servidor); ids vindos do navegador são validados e sempre
  conferidos dentro da empresa.
*/

const id = z.string().min(1).max(64);
const formType = z.enum(['ANAMNESIS', 'ASSESSMENT', 'SERVICE_RECORD', 'CUSTOM']);
const entryStatus = z.enum(['REQUESTED', 'DRAFT', 'SUBMITTED', 'REVIEWED']);

/** Respostas: chave = id da pergunta. O tamanho total é limitado (texto longo × perguntas). */
const answersInput = z
  .record(z.string().max(60), z.unknown())
  .refine((a) => JSON.stringify(a).length <= 200_000, 'Respostas grandes demais.');

const templateInput = z.object({
  id: id.nullable(),
  name: z.string().trim().min(1, 'Informe o nome do modelo.').max(120),
  type: formType,
  description: z.string().trim().max(1000).nullable().optional(),
  instructions: z.string().trim().max(2000).nullable().optional(),
  fillableBy: z.enum(['PROFESSIONAL', 'CLIENT', 'BOTH']),
  renewal: z.enum(['EACH_VISIT', 'ONCE', 'AFTER_DAYS']),
  renewalDays: z.number().int().min(1).max(3650).nullable().optional(),
  requirement: z.enum(['NONE', 'SUBMITTED', 'REVIEWED']),
  schema: z.unknown(),
  serviceIds: z.array(id).max(100),
});

async function withNames<
  T extends { filledByUserId: string | null; reviewedByUserId: string | null },
>(rows: T[]) {
  const names = await actorNames(
    rows.flatMap((r) => [r.filledByUserId, r.reviewedByUserId]).filter((v): v is string => !!v),
  );
  const nameOf = (userId: string | null) =>
    userId ? (systemActorLabel(userId) ?? names.get(userId) ?? 'Equipe') : null;
  return rows.map((r) => ({
    ...r,
    filledByName: nameOf(r.filledByUserId),
    reviewedByName: nameOf(r.reviewedByUserId),
  }));
}

// ---- Permissões da pessoa logada ---------------------------------------------------------------

export async function getMyFormAccessAction() {
  const { access } = await requireFormAccess();
  return access;
}

// ---- Modelos -----------------------------------------------------------------------------------

export async function listTemplatesAction(input: unknown = {}) {
  const parsed = z.object({ includeArchived: z.boolean().optional() }).parse(input ?? {});
  const { company } = await requireCurrentCompany();
  return listTemplates(company.id, parsed);
}

export async function getTemplateAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, version: z.number().int().min(1).optional() }).parse(input);
    const { company } = await requireCurrentCompany();
    return getTemplate(company.id, parsed.id, parsed.version);
  });
}

export async function saveTemplateAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = templateInput.parse(input);
    const { company, access } = await requireFormAccess();
    requireAccess(access, 'canManage', 'gerenciar modelos');
    return saveTemplate(company.id, parsed.id, parsed, access.userId);
  });
}

export async function duplicateTemplateAction(rawId: unknown) {
  return toActionResult(async () => {
    const templateId = parseId(rawId);
    const { company, access } = await requireFormAccess();
    requireAccess(access, 'canManage', 'gerenciar modelos');
    return duplicateTemplate(company.id, templateId, access.userId);
  });
}

export async function setTemplateArchivedAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, archived: z.boolean() }).parse(input);
    const { company, access } = await requireFormAccess();
    requireAccess(access, 'canManage', 'gerenciar modelos');
    await setTemplateArchived(company.id, parsed.id, parsed.archived, access.userId);
  });
}

export async function createStarterAnamnesisAction() {
  return toActionResult(async () => {
    const { company, access } = await requireFormAccess();
    requireAccess(access, 'canManage', 'gerenciar modelos');
    return createStarterAnamnesis(company.id, access.userId);
  });
}

// ---- Fichas ------------------------------------------------------------------------------------

const listInput = z.object({
  status: entryStatus.optional(),
  templateId: id.optional(),
  type: formType.optional(),
  clientId: id.optional(),
  search: z.string().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.number().int().min(1).max(10_000).optional(),
});

export async function listEntriesAction(input: unknown) {
  const parsed = listInput.parse(input ?? {});
  const { company } = await requireFormAccess();
  const result = await listEntries(company.id, parsed);
  return { ...result, entries: await withNames(result.entries) };
}

export async function listClientEntriesAction(rawClientId: unknown) {
  const clientId = parseId(rawClientId);
  const { company } = await requireFormAccess();
  const result = await listClientEntries(company.id, clientId);
  return { ...result, entries: await withNames(result.entries) };
}

export async function getEntryDetailAction(rawId: unknown) {
  return toActionResult(async () => {
    const entryId = parseId(rawId);
    const { company, access } = await requireFormAccess();
    const detail = await getEntryDetail(company.id, access, entryId);
    const entry = await prisma.formEntry.findFirst({
      where: { id: entryId, companyId: company.id },
      select: { filledByUserId: true, reviewedByUserId: true },
    });
    const [named] = await withNames([
      {
        filledByUserId: entry?.filledByUserId ?? null,
        reviewedByUserId: entry?.reviewedByUserId ?? null,
      },
    ]);
    return { ...detail, filledByName: named.filledByName, reviewedByName: named.reviewedByName };
  });
}

export async function getEntryRevisionAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, revision: z.number().int().min(1) }).parse(input);
    const { company, access } = await requireFormAccess();
    return getEntryRevision(company.id, access, parsed.id, parsed.revision);
  });
}

export async function requestEntryAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        clientId: id,
        templateId: id,
        appointmentId: id.nullable().optional(),
        clientPackageId: id.nullable().optional(),
      })
      .parse(input);
    const { company, access } = await requireFormAccess();
    const { entry, created } = await requestEntry(
      { companyId: company.id, userId: access.userId, ...parsed, source: 'manual' },
      access,
    );
    return { id: entry.id, created };
  });
}

export async function saveEntryDraftAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, answers: answersInput }).parse(input);
    const { company, access } = await requireFormAccess();
    await saveEntryDraft(company.id, access, parsed.id, parsed.answers);
    return { savedAt: new Date().toISOString() };
  });
}

export async function submitEntryAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        id,
        answers: answersInput,
        reason: z.string().trim().max(500).nullable().optional(),
        confirmCopied: z.boolean().optional(),
      })
      .parse(input);
    const { company, access } = await requireFormAccess();
    return submitEntry(company.id, access, parsed.id, parsed.answers, parsed);
  });
}

/** Liberar (ou recolher) a ficha enviada para o cliente ver na área do cliente. */
export async function setEntryReleasedAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, released: z.boolean() }).parse(input);
    const { company, access } = await requireFormAccess();
    await setEntryReleasedToClient(company.id, access, parsed.id, parsed.released);
  });
}

export async function reviewEntryAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ id, notes: z.string().trim().max(5000).nullable().optional() })
      .parse(input);
    const { company, access } = await requireFormAccess();
    await reviewEntry(company.id, access, parsed.id, parsed.notes ?? null);
  });
}

export async function requestEntryUpdateAction(rawId: unknown) {
  return toActionResult(async () => {
    const entryId = parseId(rawId);
    const { company, access } = await requireFormAccess();
    const { entry, created } = await requestEntryUpdate(company.id, access, entryId);
    return { id: entry.id, created };
  });
}

/** Link para o cliente preencher: só "Copiar link" — nada é enviado automaticamente. */
export async function createEntryLinkAction(rawId: unknown) {
  return toActionResult(async () => {
    const entryId = parseId(rawId);
    const { company, access } = await requireFormAccess();
    const { token, expiresAt } = await createEntryLink(company.id, access, entryId, FORM_LINK_DAYS);
    return { url: `${await appBaseUrl()}/ficha/${token}`, expiresAt: expiresAt.toISOString() };
  });
}

export async function revokeEntryLinksAction(rawId: unknown) {
  return toActionResult(async () => {
    const entryId = parseId(rawId);
    const { company, access } = await requireFormAccess();
    return revokeEntryLinks(company.id, access, entryId);
  });
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  requested: 'Ficha pedida',
  viewed: 'Respostas abertas',
  updated: 'Rascunho salvo',
  submitted: 'Ficha enviada',
  reviewed: 'Ficha revisada',
  exported: 'PDF exportado',
  link_created: 'Link gerado',
  link_revoked: 'Link revogado',
};

export async function listEntryAuditAction(rawId: unknown) {
  return toActionResult(async () => {
    const entryId = parseId(rawId);
    const { company, access } = await requireFormAccess();
    const rows = await listEntryAudit(company.id, access, entryId);
    const names = await actorNames(rows.map((r) => r.userId));
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: AUDIT_ACTION_LABEL[r.action] ?? r.action,
      actor:
        systemActorLabel(r.userId) ??
        (r.userId === 'client-form-link' ? 'Cliente (link)' : (names.get(r.userId) ?? 'Equipe')),
    }));
  });
}

// ---- Agenda ------------------------------------------------------------------------------------

export async function getAppointmentFormsAction(rawAppointmentId: unknown) {
  return toActionResult(async () => {
    const appointmentId = parseId(rawAppointmentId);
    const { company, access } = await requireFormAccess();
    return getAppointmentForms(company.id, appointmentId, { ensure: false, userId: access.userId });
  });
}

/** Pede as fichas que o atendimento exige e ainda não existem (repetir não duplica). */
export async function requestAppointmentFormsAction(rawAppointmentId: unknown) {
  return toActionResult(async () => {
    const appointmentId = parseId(rawAppointmentId);
    const { company, access } = await requireFormAccess();
    requireAccess(access, 'canRequest', 'pedir fichas');
    return getAppointmentForms(company.id, appointmentId, { ensure: true, userId: access.userId });
  });
}

// ---- Permissões (administrador) ----------------------------------------------------------------

const orgMembers = listTeamMembers;

export async function listFormPermissionsAction() {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    const [members, grants] = await Promise.all([
      orgMembers(company.clerkOrgId),
      listFormPermissions(company.id),
    ]);
    const byUser = new Map(grants.map((g) => [g.userId, g]));
    return members.map((m) => ({ ...m, grant: byUser.get(m.userId) ?? null }));
  });
}

const flagsInput = z.object({
  canManage: z.boolean(),
  canRequest: z.boolean(),
  canRead: z.boolean(),
  canFill: z.boolean(),
  canReview: z.boolean(),
  canExport: z.boolean(),
  canAudit: z.boolean(),
  scope: z.enum(['ALL', 'OWN']),
});

export async function setFormPermissionAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ userId: z.string().min(1).max(64), flags: flagsInput }).parse(input);
    const { company, userId } = await requireCompanyAdmin();
    const members = await orgMembers(company.clerkOrgId);
    if (!members.some((m) => m.userId === parsed.userId)) {
      throw new UserError('Esta pessoa não faz parte da empresa.');
    }
    // Ler é pré-requisito de preencher, revisar e exportar (sem ler, não dá para fazer nenhum).
    const flags = parsed.flags.canRead
      ? parsed.flags
      : { ...parsed.flags, canFill: false, canReview: false, canExport: false };
    await setFormPermission({
      companyId: company.id,
      userId: parsed.userId,
      flags,
      updatedByUserId: userId,
    });
  });
}

export async function setFormsPrivacyNoticeAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ text: z.string().trim().max(3000) }).parse(input);
    const { company, userId } = await requireCompanyAdmin();
    await prisma.company.update({
      where: { id: company.id },
      data: { formsPrivacyNotice: parsed.text || null },
    });
    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        entityType: 'Company',
        entityId: company.id,
        action: 'updated',
        userId,
        metadata: { fields: ['formsPrivacyNotice'] },
      },
    });
  });
}

export async function getFormsSettingsAction() {
  const { company } = await requireCurrentCompany();
  const row = await prisma.company.findUnique({
    where: { id: company.id },
    select: { formsPrivacyNotice: true },
  });
  return { privacyNotice: row?.formsPrivacyNotice ?? '' };
}
