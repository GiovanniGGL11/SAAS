'use server';

import { z } from 'zod';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { listTeamMembers } from '@/server/team';
import { toActionResult } from '@/server/action-result';
import { assertFeature } from '@/server/billing/features';
import { UserError, parseId } from '@/server/errors';
import { appBaseUrl } from '@/server/app-url';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { requireFormAccess } from '@/server/auth/form-access';
import { requireAccess } from '@/server/data/form-permissions';
import { assertOwnAppointment, getViewerScope } from '@/server/auth/professional-scope';
import { findClientByPhone } from '@/server/data/client-match';
import { SIGNUP_INVITE_DAYS, signSignupInvite } from '@/server/data/signup-invite';
import { hasFeature } from '@/server/billing/features';
import { whatsappLink } from '@/lib/phone';
import { listFormPermissions, setFormPermission } from '@/server/data/form-permissions';
import { actorNames } from '@/server/data/audit-history';
import { systemActorLabel } from '@/lib/audit-describe';
import {
  FORM_LINK_DAYS,
  createEntryLink,
  createStarterAnamnesis,
  duplicateTemplate,
  getAppointmentForms,
  listWhatsappFormOptions,
  prepareFormForWhatsapp,
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
  createStarterTemplate,
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
    assertFeature(company, 'forms');
    requireAccess(access, 'canManage', 'gerenciar modelos');
    return saveTemplate(company.id, parsed.id, parsed, access.userId);
  });
}

export async function duplicateTemplateAction(rawId: unknown) {
  return toActionResult(async () => {
    const templateId = parseId(rawId);
    const { company, access } = await requireFormAccess();
    assertFeature(company, 'forms');
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
    assertFeature(company, 'forms');
    requireAccess(access, 'canManage', 'gerenciar modelos');
    return createStarterAnamnesis(company.id, access.userId);
  });
}

export async function createStarterTemplateAction(rawKey: unknown) {
  return toActionResult(async () => {
    const key = z.string().max(30).parse(rawKey);
    const { company, access } = await requireFormAccess();
    assertFeature(company, 'forms');
    requireAccess(access, 'canManage', 'gerenciar modelos');
    const template = await createStarterTemplate(company.id, access.userId, key);
    return { id: template.id };
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
    assertFeature(company, 'forms');
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
    assertFeature(company, 'forms');
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
    assertFeature(company, 'forms');
    requireAccess(access, 'canRequest', 'pedir fichas');
    return getAppointmentForms(company.id, appointmentId, { ensure: true, userId: access.userId });
  });
}

/**
 * Fichas que dá para mandar pelo WhatsApp a partir do agendamento. Sem o recurso de fichas no
 * plano, diz só isso (a tela mostra o convite em vez do botão).
 */
export async function getWhatsappFormOptionsAction(rawAppointmentId: unknown) {
  return toActionResult(async () => {
    const appointmentId = parseId(rawAppointmentId);
    const { company, access } = await requireFormAccess();
    if (!hasFeature(company, 'forms')) return { available: false as const };
    await assertOwnAppointment(appointmentId);
    const result = await listWhatsappFormOptions(company.id, appointmentId);
    return { available: true as const, canRequest: access.canRequest, ...result };
  });
}

/**
 * "Enviar pelo WhatsApp" na agenda: pede a ficha, gera o link de 7 dias e devolve a mensagem
 * pronta para o número do cliente. Nada sai sozinho: quem envia é a pessoa, no WhatsApp dela.
 */
export async function sendFormViaWhatsappAction(input: unknown) {
  return toActionResult(async () => {
    const { appointmentId, templateId } = z
      .object({ appointmentId: id, templateId: id })
      .parse(input);
    const { company, access } = await requireFormAccess();
    assertFeature(company, 'forms');
    await assertOwnAppointment(appointmentId);
    const result = await prepareFormForWhatsapp(company.id, access, appointmentId, templateId);
    if (result.alreadyAnswered) return result;
    const appointment = await prisma.appointment.findFirstOrThrow({
      where: { id: appointmentId, companyId: company.id },
      select: {
        startAt: true,
        serviceNameSnapshot: true,
        client: { select: { name: true, phone: true } },
      },
    });
    const template = await prisma.formTemplate.findFirstOrThrow({
      where: { id: templateId, companyId: company.id },
      select: { name: true },
    });
    const url = `${await appBaseUrl()}/ficha/${result.token}`;
    const firstName = appointment.client.name.trim().split(/\s+/)[0];
    const when = new Intl.DateTimeFormat('pt-BR', {
      timeZone: company.timezone,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(appointment.startAt);
    const message =
      `Olá, ${firstName}! Para o seu atendimento de ${appointment.serviceNameSnapshot} em ${when}, ` +
      `preencha e assine a ficha "${template.name}" pelo celular:\n${url}\n\n` +
      `Leva poucos minutos e o link vale ${FORM_LINK_DAYS} dias. ${company.name}`;
    return {
      alreadyAnswered: false as const,
      url,
      message,
      whatsappUrl: whatsappLink(appointment.client.phone, message),
      expiresAt: result.expiresAt.toISOString(),
    };
  });
}

// ---- Enviar ficha pelo WhatsApp, pelo telefone (aba Fichas) -------------------------------------

/** Equipe que pode pedir fichas; a profissional com login próprio não usa esta tela. */
async function requireFormSender() {
  const session = await requireFormAccess();
  assertFeature(session.company, 'forms');
  requireAccess(session.access, 'canRequest', 'pedir fichas');
  const scope = await getViewerScope();
  if (scope.professional) {
    throw new UserError('Envie a ficha pelo agendamento do cliente, na agenda.');
  }
  return session;
}

/** Modelo que o cliente pode preencher (não "só a equipe"), ativo e desta empresa. */
async function clientFillableTemplate(companyId: string, templateId: string) {
  const template = await prisma.formTemplate.findFirst({
    where: { id: templateId, companyId, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      versions: { orderBy: { version: 'desc' }, take: 1, select: { fillableBy: true } },
    },
  });
  if (!template) throw new UserError('Modelo de ficha não encontrado.');
  if (template.versions[0]?.fillableBy === 'PROFESSIONAL') {
    throw new UserError('Este modelo é preenchido só pela equipe.');
  }
  return template;
}

const phoneInput = z
  .string()
  .max(40)
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 10 && v.length <= 15, 'Confira o telefone, com DDD.');

/** Consulta o número: já é cliente? (mesmo celular escrito de jeitos diferentes conta). */
export async function findClientForFormAction(input: unknown) {
  return toActionResult(async () => {
    const { phone } = z.object({ phone: phoneInput }).parse(input);
    const { company } = await requireFormSender();
    const client = await findClientByPhone(company.id, phone);
    return {
      phone,
      client: client ? { id: client.id, name: client.name, active: client.active } : null,
    };
  });
}

/** Link da ficha de um cliente já cadastrado, com a mensagem pronta para o WhatsApp dele. */
async function formMessageFor(
  company: { id: string; name: string },
  access: Awaited<ReturnType<typeof requireFormSender>>['access'],
  client: { id: string; name: string; phone: string | null },
  template: { id: string; name: string },
) {
  const { entry } = await requestEntry(
    {
      companyId: company.id,
      userId: access.userId,
      clientId: client.id,
      templateId: template.id,
      source: 'manual',
    },
    access,
  );
  const { token } = await createEntryLink(company.id, access, entry.id, FORM_LINK_DAYS);
  const url = `${await appBaseUrl()}/ficha/${token}`;
  const firstName = client.name.trim().split(/\s+/)[0];
  const message =
    `Olá, ${firstName}! ${company.name} pediu para você preencher e assinar a ficha ` +
    `"${template.name}" pelo celular:\n${url}\n\n` +
    `Leva poucos minutos e o link vale ${FORM_LINK_DAYS} dias.`;
  return { kind: 'form' as const, url, message, whatsappUrl: whatsappLink(client.phone, message) };
}

/** Cliente já cadastrado: pede a ficha e prepara a mensagem. */
export async function sendFormToClientAction(input: unknown) {
  return toActionResult(async () => {
    const { clientId, templateId } = z.object({ clientId: id, templateId: id }).parse(input);
    const { company, access } = await requireFormSender();
    const template = await clientFillableTemplate(company.id, templateId);
    const client = await prisma.client.findFirst({
      where: { id: clientId, companyId: company.id },
      select: { id: true, name: true, phone: true },
    });
    if (!client) throw new UserError('Cliente não encontrado.');
    return formMessageFor(company, access, client, template);
  });
}

/** Cliente novo, só a ficha: cadastra com nome e telefone e pede a ficha. */
export async function createClientAndSendFormAction(input: unknown) {
  return toActionResult(async () => {
    const { phone, name, templateId } = z
      .object({
        phone: phoneInput,
        name: z.string().trim().min(2, 'Informe o nome do cliente.').max(200),
        templateId: id,
      })
      .parse(input);
    const { company, access } = await requireFormSender();
    const template = await clientFillableTemplate(company.id, templateId);
    // Alguém pode ter cadastrado o número enquanto a tela estava aberta: não duplica.
    const client =
      (await findClientByPhone(company.id, phone)) ??
      (await prisma.client.create({
        data: { companyId: company.id, name, phone },
      }));
    revalidatePath('/clientes');
    return formMessageFor(company, access, client, template);
  });
}

/**
 * Cliente novo, cadastro + ficha: um link só. A pessoa faz o próprio cadastro (vira cliente) e
 * segue direto para a ficha. Nenhum cliente é criado agora: só quando ela enviar o cadastro.
 */
export async function sendSignupInviteAction(input: unknown) {
  return toActionResult(async () => {
    const { phone, templateId } = z.object({ phone: phoneInput, templateId: id }).parse(input);
    const { company } = await requireFormSender();
    const template = await clientFillableTemplate(company.id, templateId);
    const { token } = signSignupInvite(company.id, template.id);
    const url = `${await appBaseUrl()}/cadastro/${company.slug}?convite=${token}&tel=${phone}`;
    const message =
      `Olá! ${company.name} preparou o seu cadastro e a ficha "${template.name}". ` +
      `Pelo link você se cadastra e, em seguida, preenche e assina a ficha pelo celular:\n${url}\n\n` +
      `Leva poucos minutos e o link vale ${SIGNUP_INVITE_DAYS} dias.`;
    return {
      kind: 'invite' as const,
      url,
      message,
      whatsappUrl: whatsappLink(phone, message),
    };
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
