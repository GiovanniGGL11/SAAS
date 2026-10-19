import { createHash, randomBytes } from 'node:crypto';

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type {
  FormEntryStatus,
  FormFiller,
  FormRenewal,
  FormRequirement,
  FormType,
} from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';
import {
  type Answers,
  type FormSchema,
  allQuestions,
  answerText,
  parseFormSchema,
  sectionsFor,
  validateAnswers,
} from '@/lib/forms/schema';
import {
  currentEntryFor,
  missingRequirementText,
  requestKeyFor,
  requirementMet,
} from '@/lib/forms/rules';
import {
  STARTER_ANAMNESIS_DESCRIPTION,
  STARTER_ANAMNESIS_INSTRUCTIONS,
  STARTER_ANAMNESIS_NAME,
  STARTER_ANAMNESIS_SCHEMA,
} from '@/lib/forms/starter';
import { entryInScope, requireAccess, type FormAccess } from '@/server/data/form-permissions';

/*
  Fichas e formulários. Regras que atravessam o arquivo:
  - o conteúdo do modelo vive em versões imutáveis; a ficha fica presa à versão que usou;
  - resposta enviada nunca é sobrescrita: cada envio vira uma revisão;
  - o histórico (AuditLog) registra quem viu, enviou, revisou e exportou — nunca as respostas;
  - status é de toda a equipe; respostas só com permissão (ver form-permissions.ts).
*/

type Db = Prisma.TransactionClient | typeof prisma;
/** Transações deste módulo fazem várias consultas seguidas: folga acima dos 5 s padrão. */
const TX = { maxWait: 10_000, timeout: 20_000 };
const txRun = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, TX);

/** Autor dos registros feitos pelo cliente no link (aparece como "Cliente (link da ficha)"). */
export const FORM_LINK_ACTOR = 'client-form-link';

// ---- Modelos ---------------------------------------------------------------------------------

export type TemplateInput = {
  name: string;
  type: FormType;
  description?: string | null;
  instructions?: string | null;
  fillableBy: FormFiller;
  renewal: FormRenewal;
  renewalDays?: number | null;
  requirement: FormRequirement;
  schema: unknown;
  serviceIds: string[];
};

/** JSON com chaves em ordem: o Postgres reordena as chaves do jsonb, e a comparação não pode cair nisso. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function versionFields(input: TemplateInput, schema: FormSchema) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    instructions: input.instructions?.trim() || null,
    fillableBy: input.fillableBy,
    renewal: input.renewal,
    renewalDays: input.renewal === 'AFTER_DAYS' ? (input.renewalDays ?? null) : null,
    requirement: input.requirement,
    schema: schema as unknown as Prisma.InputJsonValue,
  };
}

async function assertServices(db: Db, companyId: string, serviceIds: string[]) {
  const unique = [...new Set(serviceIds)];
  if (unique.length === 0) return unique;
  const found = await db.service.count({ where: { companyId, id: { in: unique } } });
  if (found !== unique.length) throw new UserError('Serviço não encontrado.');
  return unique;
}

async function lockTemplate(db: Prisma.TransactionClient, companyId: string, id: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "FormTemplate" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  if (rows.length === 0) throw new UserError('Modelo não encontrado.');
}

/**
 * Cria ou edita um modelo. Editar perguntas, regras ou exigência cria uma versão nova — fichas
 * já pedidas continuam na versão delas. Mudar só o nome ou os serviços ligados não cria versão.
 */
export async function saveTemplate(
  companyId: string,
  id: string | null,
  input: TemplateInput,
  userId: string,
) {
  const schema = parseFormSchema(input.schema);
  if (input.renewal === 'AFTER_DAYS' && !input.renewalDays) {
    throw new UserError('Informe depois de quantos dias a ficha deve ser pedida de novo.');
  }
  const fields = versionFields(input, schema);
  return txRun(async (tx) => {
    const serviceIds = await assertServices(tx, companyId, input.serviceIds);
    if (!id) {
      const template = await tx.formTemplate.create({
        data: {
          companyId,
          name: fields.name,
          type: input.type,
          createdByUserId: userId,
          versions: { create: { companyId, version: 1, ...fields, createdByUserId: userId } },
          services: { create: serviceIds.map((serviceId) => ({ serviceId, companyId })) },
        },
      });
      await recordAuditLog(
        {
          companyId,
          entityType: 'FormTemplate',
          entityId: template.id,
          action: 'created',
          userId,
          metadata: { name: fields.name, version: 1 },
        },
        tx,
      );
      return { id: template.id, version: 1, newVersion: true };
    }

    await lockTemplate(tx, companyId, id);
    const template = (await tx.formTemplate.findFirst({ where: { id, companyId } }))!;
    if (template.status === 'ARCHIVED') {
      throw new UserError('Este modelo está arquivado. Restaure-o antes de editar.');
    }
    const current = await tx.formTemplateVersion.findUniqueOrThrow({
      where: { templateId_version: { templateId: id, version: template.currentVersion } },
    });
    // O nome é do modelo (renomear não muda as perguntas): fica fora da comparação.
    const pick = (v: typeof fields | typeof current) => ({
      description: v.description,
      instructions: v.instructions,
      fillableBy: v.fillableBy,
      renewal: v.renewal,
      renewalDays: v.renewalDays,
      requirement: v.requirement,
      schema: v.schema,
    });
    const changed = stableStringify(pick(current)) !== stableStringify(pick(fields));
    const version = changed ? template.currentVersion + 1 : template.currentVersion;
    if (changed) {
      await tx.formTemplateVersion.create({
        data: { templateId: id, companyId, version, ...fields, createdByUserId: userId },
      });
    }
    await tx.formTemplate.update({
      where: { id },
      data: { name: fields.name, type: input.type, currentVersion: version },
    });
    await tx.formTemplateService.deleteMany({ where: { templateId: id } });
    if (serviceIds.length) {
      await tx.formTemplateService.createMany({
        data: serviceIds.map((serviceId) => ({ templateId: id, serviceId, companyId })),
      });
    }
    await recordAuditLog(
      {
        companyId,
        entityType: 'FormTemplate',
        entityId: id,
        action: 'updated',
        userId,
        metadata: { name: fields.name, version, newVersion: changed },
      },
      tx,
    );
    return { id, version, newVersion: changed };
  });
}

export async function listTemplates(companyId: string, filter?: { includeArchived?: boolean }) {
  const templates = await prisma.formTemplate.findMany({
    where: { companyId, ...(filter?.includeArchived ? {} : { status: 'ACTIVE' }) },
    include: {
      services: { select: { serviceId: true, service: { select: { name: true } } } },
      versions: { orderBy: { version: 'desc' }, take: 1 },
      _count: { select: { entries: true } },
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });
  return templates.map((t) => {
    const v = t.versions[0];
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      status: t.status,
      currentVersion: t.currentVersion,
      description: v?.description ?? null,
      fillableBy: v?.fillableBy ?? 'BOTH',
      renewal: v?.renewal ?? 'ONCE',
      renewalDays: v?.renewalDays ?? null,
      requirement: v?.requirement ?? 'NONE',
      questionCount: v ? allQuestions(v.schema as unknown as FormSchema).length : 0,
      services: t.services.map((s) => ({ id: s.serviceId, name: s.service.name })),
      entryCount: t._count.entries,
      updatedAt: t.updatedAt,
    };
  });
}

export async function getTemplate(companyId: string, id: string, version?: number) {
  const template = await prisma.formTemplate.findFirst({
    where: { id, companyId },
    include: { services: { select: { serviceId: true } } },
  });
  if (!template) throw new UserError('Modelo não encontrado.');
  const v = await prisma.formTemplateVersion.findUnique({
    where: {
      templateId_version: { templateId: id, version: version ?? template.currentVersion },
    },
  });
  if (!v) throw new UserError('Versão do modelo não encontrada.');
  return {
    id: template.id,
    name: template.name,
    type: template.type,
    status: template.status,
    currentVersion: template.currentVersion,
    version: v.version,
    description: v.description,
    instructions: v.instructions,
    fillableBy: v.fillableBy,
    renewal: v.renewal,
    renewalDays: v.renewalDays,
    requirement: v.requirement,
    schema: v.schema as unknown as FormSchema,
    serviceIds: template.services.map((s) => s.serviceId),
  };
}

export async function duplicateTemplate(companyId: string, id: string, userId: string) {
  const source = await getTemplate(companyId, id);
  // Os serviços não vêm junto: dois modelos exigidos no mesmo serviço seria surpresa.
  return saveTemplate(
    companyId,
    null,
    { ...source, name: `Cópia de ${source.name}`.slice(0, 120), serviceIds: [] },
    userId,
  );
}

/** Arquivar impede pedidos novos; fichas já feitas continuam visíveis. */
export async function setTemplateArchived(
  companyId: string,
  id: string,
  archived: boolean,
  userId: string,
) {
  const result = await prisma.formTemplate.updateMany({
    where: { id, companyId },
    data: { status: archived ? 'ARCHIVED' : 'ACTIVE' },
  });
  if (result.count === 0) throw new UserError('Modelo não encontrado.');
  await recordAuditLog({
    companyId,
    entityType: 'FormTemplate',
    entityId: id,
    action: archived ? 'archived' : 'restored',
    userId,
  });
}

/** Modelo inicial de anamnese: criado sob pedido, sem serviços e sem exigência (não ativa sozinho). */
export async function createStarterAnamnesis(companyId: string, userId: string) {
  return saveTemplate(
    companyId,
    null,
    {
      name: STARTER_ANAMNESIS_NAME,
      type: 'ANAMNESIS',
      description: STARTER_ANAMNESIS_DESCRIPTION,
      instructions: STARTER_ANAMNESIS_INSTRUCTIONS,
      fillableBy: 'BOTH',
      renewal: 'AFTER_DAYS',
      renewalDays: 180,
      requirement: 'NONE',
      schema: STARTER_ANAMNESIS_SCHEMA,
      serviceIds: [],
    },
    userId,
  );
}

// ---- Fichas (preenchimentos) -------------------------------------------------------------------

const entryInclude = {
  version: true,
  template: { select: { id: true, name: true, type: true, status: true, currentVersion: true } },
  client: { select: { id: true, name: true } },
  appointment: { select: { professionalId: true, startAt: true } },
  clientPackage: { select: { responsibleProfessionalId: true, nameSnapshot: true } },
  sessionRecord: { select: { professionalId: true } },
} as const;

async function loadEntry(db: Db, companyId: string, entryId: string) {
  const entry = await db.formEntry.findFirst({
    where: { id: entryId, companyId },
    include: entryInclude,
  });
  if (!entry) throw new UserError('Ficha não encontrada.');
  return entry;
}

type LoadedEntry = Awaited<ReturnType<typeof loadEntry>>;

function assertInScope(access: FormAccess, entry: LoadedEntry) {
  const ok = entryInScope(access, {
    appointmentProfessionalId: entry.appointment?.professionalId ?? null,
    packageProfessionalId: entry.clientPackage?.responsibleProfessionalId ?? null,
    sessionProfessionalId: entry.sessionRecord?.professionalId ?? null,
  });
  if (!ok) {
    throw new UserError('Você só pode abrir fichas dos seus próprios atendimentos.');
  }
}

const schemaOf = (entry: { version: { schema: unknown } }) =>
  entry.version.schema as unknown as FormSchema;
const answersOf = (value: unknown): Answers =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Answers) : {};

export type EntryListFilter = {
  status?: FormEntryStatus;
  templateId?: string;
  type?: FormType;
  clientId?: string;
  search?: string;
  /** Período pela data de criação do pedido. */
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

/** Lista com status, sem respostas: serve a quem só acompanha (recepção) e a quem lê. */
export async function listEntries(companyId: string, filter: EntryListFilter) {
  const pageSize = Math.min(filter.pageSize ?? 20, 50);
  const page = Math.max(filter.page ?? 1, 1);
  const where: Prisma.FormEntryWhereInput = {
    companyId,
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.templateId ? { templateId: filter.templateId } : {}),
    ...(filter.type ? { template: { type: filter.type } } : {}),
    ...(filter.clientId ? { clientId: filter.clientId } : {}),
    ...(filter.search?.trim()
      ? { client: { name: { contains: filter.search.trim(), mode: 'insensitive' } } }
      : {}),
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lt: filter.to } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.formEntry.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        template: { select: { id: true, name: true, type: true, status: true } },
        version: {
          select: { version: true, fillableBy: true, renewal: true, renewalDays: true },
        },
        appointment: {
          select: {
            startAt: true,
            serviceNameSnapshot: true,
            professional: { select: { name: true } },
          },
        },
        clientPackage: { select: { nameSnapshot: true } },
        accessTokens: {
          where: { revokedAt: null, usedAt: null },
          select: { expiresAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.formEntry.count({ where }),
  ]);
  const now = Date.now();
  return {
    total,
    page,
    pageSize,
    entries: rows.map((e) => ({
      id: e.id,
      status: e.status,
      client: e.client,
      template: e.template,
      version: e.version.version,
      fillableBy: e.version.fillableBy,
      revision: e.revision,
      needsCheck: !!e.copiedFromEntryId && e.revision === 0,
      appointmentAt: e.appointment?.startAt ?? null,
      appointmentService: e.appointment?.serviceNameSnapshot ?? null,
      professionalName: e.appointment?.professional.name ?? null,
      packageName: e.clientPackage?.nameSnapshot ?? null,
      renewal: e.version.renewal,
      renewalDays: e.version.renewalDays,
      filledBy: e.filledBy,
      filledByUserId: e.filledByUserId,
      reviewedByUserId: e.reviewedByUserId,
      submittedAt: e.submittedAt,
      reviewedAt: e.reviewedAt,
      updatedAt: e.updatedAt,
      createdAt: e.createdAt,
      linkActive: e.accessTokens.some((t) => t.expiresAt.getTime() > now),
    })),
  };
}

/** Abrir a ficha com as respostas: exige permissão de leitura e fica registrado. */
export async function getEntryDetail(companyId: string, access: FormAccess, entryId: string) {
  requireAccess(access, 'canRead', 'ver as respostas das fichas');
  const entry = await loadEntry(prisma, companyId, entryId);
  assertInScope(access, entry);
  const [revisions, previous] = await Promise.all([
    prisma.formEntryRevision.findMany({
      where: { entryId, companyId },
      select: { revision: true, submittedAt: true, filledBy: true, reason: true },
      orderBy: { revision: 'desc' },
    }),
    entry.copiedFromEntryId
      ? prisma.formEntry.findFirst({
          where: { id: entry.copiedFromEntryId, companyId },
          select: { answers: true, submittedAt: true },
        })
      : null,
  ]);
  const links = await prisma.formAccessToken.findMany({
    where: { entryId, revokedAt: null, usedAt: null, expiresAt: { gt: new Date() } },
    select: { expiresAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  await recordAuditLog({
    companyId,
    entityType: 'FormEntry',
    entityId: entryId,
    action: 'viewed',
    userId: access.userId,
    metadata: { clientId: entry.clientId, name: entry.template.name },
  });
  return {
    id: entry.id,
    status: entry.status,
    client: entry.client,
    template: entry.template,
    version: {
      number: entry.version.version,
      isCurrent: entry.version.version === entry.template.currentVersion,
      name: entry.version.name,
      instructions: entry.version.instructions,
      fillableBy: entry.version.fillableBy,
      schema: schemaOf(entry),
    },
    answers: answersOf(entry.answers),
    /** Respostas copiadas da ficha anterior que ainda precisam ser conferidas. */
    copiedFrom: previous
      ? { answers: answersOf(previous.answers), submittedAt: previous.submittedAt }
      : null,
    needsCheck: !!entry.copiedFromEntryId && entry.revision === 0,
    revision: entry.revision,
    filledBy: entry.filledBy,
    submittedAt: entry.submittedAt,
    reviewedAt: entry.reviewedAt,
    reviewNotes: entry.reviewNotes,
    appointmentAt: entry.appointment?.startAt ?? null,
    packageName: entry.clientPackage?.nameSnapshot ?? null,
    revisions,
    activeLink: links[0] ?? null,
    releasedToClientAt: entry.releasedToClientAt,
  };
}

export async function getEntryRevision(
  companyId: string,
  access: FormAccess,
  entryId: string,
  revision: number,
) {
  requireAccess(access, 'canRead', 'ver as respostas das fichas');
  const entry = await loadEntry(prisma, companyId, entryId);
  assertInScope(access, entry);
  const row = await prisma.formEntryRevision.findUnique({
    where: { entryId_revision: { entryId, revision } },
  });
  if (!row || row.companyId !== companyId) throw new UserError('Revisão não encontrada.');
  await recordAuditLog({
    companyId,
    entityType: 'FormEntry',
    entityId: entryId,
    action: 'viewed',
    userId: access.userId,
    metadata: { clientId: entry.clientId, name: entry.template.name, revision },
  });
  return {
    revision: row.revision,
    answers: answersOf(row.answers),
    filledBy: row.filledBy,
    reason: row.reason,
    submittedAt: row.submittedAt,
  };
}

async function lockClientTemplate(
  db: Prisma.TransactionClient,
  clientId: string,
  templateId: string,
) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'form:' + clientId + ':' + templateId}))`;
}

type RequestParams = {
  companyId: string;
  userId: string;
  clientId: string;
  templateId: string;
  appointmentId?: string | null;
  clientPackageId?: string | null;
  sessionRecordId?: string | null;
  /** Chave explícita (ficha inicial do pacote); sem ela, vem da regra de renovação. */
  requestKey?: string | null;
  /**
   * manual: "Nova ficha" no cliente — reaproveita uma em aberto do mesmo modelo.
   * auto: exigida por serviço ou pacote — reaproveita a que ainda vale pela regra de renovação.
   */
  source: 'manual' | 'auto';
};

async function requestEntryTx(tx: Prisma.TransactionClient, params: RequestParams) {
  const template = await tx.formTemplate.findFirst({
    where: { id: params.templateId, companyId: params.companyId },
  });
  if (!template) throw new UserError('Modelo não encontrado.');
  if (template.status === 'ARCHIVED') {
    throw new UserError('Este modelo está arquivado: não dá para pedir fichas novas com ele.');
  }
  const version = await tx.formTemplateVersion.findUniqueOrThrow({
    where: { templateId_version: { templateId: template.id, version: template.currentVersion } },
  });
  const client = await tx.client.findFirst({
    where: { id: params.clientId, companyId: params.companyId },
    select: { id: true },
  });
  if (!client) throw new UserError('Cliente não encontrado.');
  let appointmentAt: Date | null = null;
  if (params.appointmentId) {
    const appointment = await tx.appointment.findFirst({
      where: { id: params.appointmentId, companyId: params.companyId, clientId: params.clientId },
      select: { startAt: true },
    });
    if (!appointment) throw new UserError('Agendamento não encontrado para este cliente.');
    appointmentAt = appointment.startAt;
  }
  if (params.clientPackageId) {
    const pkg = await tx.clientPackage.findFirst({
      where: { id: params.clientPackageId, companyId: params.companyId, clientId: params.clientId },
      select: { id: true },
    });
    if (!pkg) throw new UserError('Pacote não encontrado para este cliente.');
  }

  await lockClientTemplate(tx, params.clientId, template.id);
  const requestKey =
    params.requestKey ??
    requestKeyFor({
      templateId: template.id,
      clientId: params.clientId,
      renewal: version.renewal,
      appointmentId: params.appointmentId ?? null,
    });
  if (requestKey) {
    const existing = await tx.formEntry.findUnique({ where: { requestKey } });
    if (existing) return { entry: existing, created: false };
  } else if (params.source === 'manual') {
    const open = await tx.formEntry.findFirst({
      where: {
        companyId: params.companyId,
        clientId: params.clientId,
        templateId: template.id,
        status: { in: ['REQUESTED', 'DRAFT'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (open) return { entry: open, created: false };
  } else {
    const entries = await tx.formEntry.findMany({
      where: { companyId: params.companyId, clientId: params.clientId, templateId: template.id },
      select: { id: true, status: true, appointmentId: true, submittedAt: true, createdAt: true },
    });
    const current = currentEntryFor(entries, version, {
      appointmentId: params.appointmentId ?? '',
      at: appointmentAt ?? new Date(),
    });
    if (current) {
      return {
        entry: await tx.formEntry.findUniqueOrThrow({ where: { id: current.id } }),
        created: false,
      };
    }
  }

  const entry = await tx.formEntry.create({
    data: {
      companyId: params.companyId,
      clientId: params.clientId,
      templateId: template.id,
      versionId: version.id,
      appointmentId: params.appointmentId ?? null,
      clientPackageId: params.clientPackageId ?? null,
      sessionRecordId: params.sessionRecordId ?? null,
      requestKey,
      createdByUserId: params.userId,
    },
  });
  await recordAuditLog(
    {
      companyId: params.companyId,
      entityType: 'FormEntry',
      entityId: entry.id,
      action: 'requested',
      userId: params.userId,
      metadata: { clientId: params.clientId, name: template.name, source: params.source },
    },
    tx,
  );
  return { entry, created: true };
}

export async function requestEntry(params: RequestParams, access?: FormAccess) {
  if (access) requireAccess(access, 'canRequest', 'pedir fichas');
  try {
    return await txRun((tx) => requestEntryTx(tx, params));
  } catch (error) {
    // Duas telas pedindo ao mesmo tempo com a mesma chave: a outra já criou — a nova tentativa
    // encontra a dela.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return txRun((tx) => requestEntryTx(tx, params));
    }
    throw error;
  }
}

/** Rascunho da equipe: salva sem exigir as obrigatórias. */
export async function saveEntryDraft(
  companyId: string,
  access: FormAccess,
  entryId: string,
  raw: Answers,
) {
  requireAccess(access, 'canFill', 'preencher fichas');
  const entry = await loadEntry(prisma, companyId, entryId);
  assertInScope(access, entry);
  if (entry.status !== 'REQUESTED' && entry.status !== 'DRAFT') {
    throw new UserError('Esta ficha já foi enviada. Para mudar, use "Corrigir respostas".');
  }
  const { answers } = validateAnswers(schemaOf(entry), raw, { mode: 'draft', audience: 'staff' });
  const result = await prisma.formEntry.updateMany({
    where: { id: entryId, companyId, status: { in: ['REQUESTED', 'DRAFT'] } },
    data: {
      answers: answers as Prisma.InputJsonValue,
      status: 'DRAFT',
      filledBy: 'STAFF',
      filledByUserId: access.userId,
    },
  });
  if (result.count === 0) throw new UserError('Esta ficha acabou de ser enviada por outra pessoa.');
  await recordAuditLog({
    companyId,
    entityType: 'FormEntry',
    entityId: entryId,
    action: 'updated',
    userId: access.userId,
    metadata: { clientId: entry.clientId, name: entry.template.name, draft: true },
  });
}

async function lockEntry(db: Prisma.TransactionClient, companyId: string, id: string) {
  const rows = await db.$queryRaw<{ status: FormEntryStatus; revision: number }[]>`
    SELECT status, revision FROM "FormEntry" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  if (rows.length === 0) throw new UserError('Ficha não encontrada.');
  return rows[0];
}

function describeErrors(errors: Record<string, string>) {
  const count = Object.keys(errors).length;
  return count === 1
    ? 'Falta 1 resposta obrigatória ou há uma resposta inválida.'
    : `Faltam ${count} respostas obrigatórias ou há respostas inválidas.`;
}

/**
 * Envio pela equipe (preenchendo com o cliente ou em nome dele). Corrigir uma ficha já enviada
 * pede o motivo e cria uma revisão nova; a anterior continua guardada.
 */
export async function submitEntry(
  companyId: string,
  access: FormAccess,
  entryId: string,
  raw: Answers,
  options: { reason?: string | null; confirmCopied?: boolean } = {},
) {
  requireAccess(access, 'canFill', 'preencher fichas');
  const entry = await loadEntry(prisma, companyId, entryId);
  assertInScope(access, entry);
  const correction = entry.status === 'SUBMITTED' || entry.status === 'REVIEWED';
  const reason = options.reason?.trim() || null;
  if (correction && (!reason || reason.length < 3)) {
    throw new UserError('Para corrigir uma ficha enviada, informe o motivo da correção.');
  }
  if (entry.copiedFromEntryId && entry.revision === 0 && !options.confirmCopied) {
    throw new UserError('Confira as respostas copiadas da ficha anterior antes de enviar.');
  }
  const { answers, errors } = validateAnswers(schemaOf(entry), raw, {
    mode: 'submit',
    audience: 'staff',
  });
  if (Object.keys(errors).length) throw new UserError(describeErrors(errors));

  return txRun(async (tx) => {
    const locked = await lockEntry(tx, companyId, entryId);
    if (locked.status !== entry.status) {
      throw new UserError(
        'A ficha mudou enquanto você editava. Abra de novo para ver a versão atual.',
      );
    }
    const revision = locked.revision + 1;
    await tx.formEntryRevision.create({
      data: {
        entryId,
        companyId,
        revision,
        answers: answers as Prisma.InputJsonValue,
        filledBy: 'STAFF',
        filledByUserId: access.userId,
        reason,
      },
    });
    await tx.formEntry.update({
      where: { id: entryId },
      data: {
        answers: answers as Prisma.InputJsonValue,
        status: 'SUBMITTED',
        revision,
        filledBy: 'STAFF',
        filledByUserId: access.userId,
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedByUserId: null,
      },
    });
    // Enviada: o link que estava com o cliente não vale mais.
    await tx.formAccessToken.updateMany({
      where: { entryId, revokedAt: null, usedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAuditLog(
      {
        companyId,
        entityType: 'FormEntry',
        entityId: entryId,
        action: 'submitted',
        userId: access.userId,
        metadata: {
          clientId: entry.clientId,
          name: entry.template.name,
          revision,
          correction,
          filledBy: 'STAFF',
        },
      },
      tx,
    );
    return { revision };
  });
}

/** Revisão: a observação é interna — nunca vai para o cliente nem para o histórico. */
export async function reviewEntry(
  companyId: string,
  access: FormAccess,
  entryId: string,
  notes: string | null,
) {
  requireAccess(access, 'canReview', 'revisar fichas');
  const entry = await loadEntry(prisma, companyId, entryId);
  assertInScope(access, entry);
  const result = await prisma.formEntry.updateMany({
    where: { id: entryId, companyId, status: 'SUBMITTED' },
    data: {
      status: 'REVIEWED',
      reviewedAt: new Date(),
      reviewedByUserId: access.userId,
      reviewNotes: notes?.trim() || null,
    },
  });
  if (result.count === 0) throw new UserError('Só fichas enviadas podem ser revisadas.');
  await recordAuditLog({
    companyId,
    entityType: 'FormEntry',
    entityId: entryId,
    action: 'reviewed',
    userId: access.userId,
    metadata: { clientId: entry.clientId, name: entry.template.name, revision: entry.revision },
  });
}

/**
 * "Pedir atualização": ficha nova na versão atual do modelo, já com as respostas da anterior
 * (só as perguntas que ainda existem). Elas aparecem marcadas e precisam ser conferidas antes
 * do envio — nunca viram resposta atual sem alguém olhar.
 */
export async function requestEntryUpdate(companyId: string, access: FormAccess, entryId: string) {
  requireAccess(access, 'canRequest', 'pedir fichas');
  const previous = await loadEntry(prisma, companyId, entryId);
  if (previous.status !== 'SUBMITTED' && previous.status !== 'REVIEWED') {
    throw new UserError('Só dá para pedir atualização de uma ficha já enviada.');
  }
  if (previous.template.status === 'ARCHIVED') {
    throw new UserError('Este modelo está arquivado: não dá para pedir fichas novas com ele.');
  }
  return txRun(async (tx) => {
    await lockClientTemplate(tx, previous.clientId, previous.templateId);
    const open = await tx.formEntry.findFirst({
      where: { companyId, copiedFromEntryId: previous.id, status: { in: ['REQUESTED', 'DRAFT'] } },
    });
    if (open) return { entry: open, created: false };
    const template = (await tx.formTemplate.findFirst({ where: { id: previous.templateId } }))!;
    const version = await tx.formTemplateVersion.findUniqueOrThrow({
      where: { templateId_version: { templateId: template.id, version: template.currentVersion } },
    });
    const { answers } = validateAnswers(
      version.schema as unknown as FormSchema,
      answersOf(previous.answers),
      { mode: 'draft', audience: 'staff' },
    );
    const entry = await tx.formEntry.create({
      data: {
        companyId,
        clientId: previous.clientId,
        templateId: template.id,
        versionId: version.id,
        clientPackageId: previous.clientPackageId,
        status: 'DRAFT',
        answers: answers as Prisma.InputJsonValue,
        copiedFromEntryId: previous.id,
        createdByUserId: access.userId,
      },
    });
    await recordAuditLog(
      {
        companyId,
        entityType: 'FormEntry',
        entityId: entry.id,
        action: 'requested',
        userId: access.userId,
        metadata: {
          clientId: previous.clientId,
          name: template.name,
          source: 'update',
          copiedFromEntryId: previous.id,
        },
      },
      tx,
    );
    return { entry, created: true };
  });
}

// ---- Link para o cliente -----------------------------------------------------------------------

export const FORM_LINK_DAYS = 7;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Gera o link da ficha para o cliente. Só o hash vai para o banco; o link vale para esta ficha,
 * expira e deixa de valer quando outro é gerado, quando é revogado ou depois do envio.
 */
export async function createEntryLink(
  companyId: string,
  access: FormAccess,
  entryId: string,
  days = FORM_LINK_DAYS,
) {
  requireAccess(access, 'canRequest', 'gerar link de ficha');
  const entry = await loadEntry(prisma, companyId, entryId);
  if (entry.status !== 'REQUESTED' && entry.status !== 'DRAFT') {
    throw new UserError('Esta ficha já foi enviada. Para uma nova, use "Pedir atualização".');
  }
  if (entry.version.fillableBy === 'PROFESSIONAL') {
    throw new UserError('Este modelo é preenchido só pela equipe.');
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  await txRun(async (tx) => {
    await tx.formAccessToken.updateMany({
      where: { entryId, revokedAt: null, usedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.formAccessToken.create({
      data: {
        companyId,
        entryId,
        tokenHash: hashToken(token),
        expiresAt,
        createdByUserId: access.userId,
      },
    });
    await recordAuditLog(
      {
        companyId,
        entityType: 'FormEntry',
        entityId: entryId,
        action: 'link_created',
        userId: access.userId,
        metadata: {
          clientId: entry.clientId,
          name: entry.template.name,
          expiresAt: expiresAt.toISOString(),
        },
      },
      tx,
    );
  });
  return { token, expiresAt };
}

export async function revokeEntryLinks(companyId: string, access: FormAccess, entryId: string) {
  requireAccess(access, 'canRequest', 'revogar link de ficha');
  const entry = await loadEntry(prisma, companyId, entryId);
  const result = await prisma.formAccessToken.updateMany({
    where: { entryId, companyId, revokedAt: null, usedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count > 0) {
    await recordAuditLog({
      companyId,
      entityType: 'FormEntry',
      entityId: entryId,
      action: 'link_revoked',
      userId: access.userId,
      metadata: { clientId: entry.clientId, name: entry.template.name },
    });
  }
  return { revoked: result.count };
}

export type PublicFormProblem = 'invalid' | 'expired' | 'revoked' | 'used';

async function resolveToken(db: Db, token: string) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{30,100}$/.test(token)) {
    return { problem: 'invalid' as const };
  }
  const row = await db.formAccessToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      entry: {
        include: {
          version: true,
          client: { select: { name: true } },
          template: { select: { name: true, status: true } },
        },
      },
    },
  });
  if (!row) return { problem: 'invalid' as const };
  if (row.usedAt) return { problem: 'used' as const };
  if (row.revokedAt) {
    // Revogado porque a ficha já foi enviada (pela equipe ou por outro link) é "já usado".
    const sent = row.entry.status === 'SUBMITTED' || row.entry.status === 'REVIEWED';
    return { problem: sent ? ('used' as const) : ('revoked' as const) };
  }
  if (row.expiresAt.getTime() < Date.now()) return { problem: 'expired' as const };
  if (row.entry.status !== 'REQUESTED' && row.entry.status !== 'DRAFT') {
    return { problem: 'used' as const };
  }
  return { row };
}

/** Respostas que o cliente pode ver: só das seções dele (nunca as internas da equipe). */
function clientVisibleAnswers(schema: FormSchema, answers: Answers): Answers {
  const ids = new Set(sectionsFor(schema, 'client').flatMap((s) => s.questions.map((q) => q.id)));
  return Object.fromEntries(Object.entries(answers).filter(([id]) => ids.has(id)));
}

function staffOnlyAnswers(schema: FormSchema, answers: Answers): Answers {
  const ids = new Set(
    schema.sections
      .filter((s) => s.audience === 'staff')
      .flatMap((s) => s.questions.map((q) => q.id)),
  );
  return Object.fromEntries(Object.entries(answers).filter(([id]) => ids.has(id)));
}

export async function getPublicForm(token: string) {
  const resolved = await resolveToken(prisma, token);
  if (!resolved.row) return { ok: false as const, problem: resolved.problem };
  const { entry } = resolved.row;
  const company = await prisma.company.findUnique({
    where: { id: entry.companyId },
    select: { name: true, clerkOrgId: true, formsPrivacyNotice: true },
  });
  const schema = schemaOf(entry);
  return {
    ok: true as const,
    companyName: company?.name ?? '',
    clerkOrgId: company?.clerkOrgId ?? null,
    privacyNotice: company?.formsPrivacyNotice ?? null,
    clientFirstName: entry.client.name.split(' ')[0],
    formName: entry.template.name,
    instructions: entry.version.instructions,
    schema: { sections: sectionsFor(schema, 'client') },
    // Só o rascunho digitado neste próprio link volta para a tela. Respostas de fichas anteriores
    // (ou digitadas pela equipe) não aparecem: ter o link não prova ser o cliente.
    answers:
      entry.filledBy === 'CLIENT' ? clientVisibleAnswers(schema, answersOf(entry.answers)) : {},
    expiresAt: resolved.row.expiresAt,
  };
}

export async function savePublicDraft(token: string, raw: Answers) {
  const resolved = await resolveToken(prisma, token);
  if (!resolved.row) throw new UserError(problemMessage(resolved.problem));
  const { entry } = resolved.row;
  const schema = schemaOf(entry);
  const { answers } = validateAnswers(schema, raw, { mode: 'draft', audience: 'client' });
  const merged = { ...staffOnlyAnswers(schema, answersOf(entry.answers)), ...answers };
  const result = await prisma.formEntry.updateMany({
    where: { id: entry.id, status: { in: ['REQUESTED', 'DRAFT'] } },
    data: { answers: merged as Prisma.InputJsonValue, status: 'DRAFT', filledBy: 'CLIENT' },
  });
  if (result.count === 0) throw new UserError(problemMessage('used'));
}

/**
 * Envio pelo cliente. O link é marcado como usado no mesmo UPDATE que confere se ainda vale —
 * dois cliques em "Enviar" (ou duas abas) resultam num envio só.
 */
export async function submitPublicForm(token: string, raw: Answers) {
  const resolved = await resolveToken(prisma, token);
  if (!resolved.row) throw new UserError(problemMessage(resolved.problem));
  const { entry } = resolved.row;
  const schema = schemaOf(entry);
  const { answers, errors } = validateAnswers(schema, raw, { mode: 'submit', audience: 'client' });
  if (Object.keys(errors).length) {
    return { ok: false as const, errors, message: describeErrors(errors) };
  }
  const merged = { ...staffOnlyAnswers(schema, answersOf(entry.answers)), ...answers };
  await txRun(async (tx) => {
    const claimed = await tx.formAccessToken.updateMany({
      where: {
        id: resolved.row.id,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw new UserError(problemMessage('used'));
    const locked = await lockEntry(tx, entry.companyId, entry.id);
    if (locked.status !== 'REQUESTED' && locked.status !== 'DRAFT') {
      throw new UserError(problemMessage('used'));
    }
    const revision = locked.revision + 1;
    await tx.formEntryRevision.create({
      data: {
        entryId: entry.id,
        companyId: entry.companyId,
        revision,
        answers: merged as Prisma.InputJsonValue,
        filledBy: 'CLIENT',
      },
    });
    await tx.formEntry.update({
      where: { id: entry.id },
      data: {
        answers: merged as Prisma.InputJsonValue,
        status: 'SUBMITTED',
        revision,
        filledBy: 'CLIENT',
        filledByUserId: null,
        submittedAt: new Date(),
      },
    });
    await recordAuditLog(
      {
        companyId: entry.companyId,
        entityType: 'FormEntry',
        entityId: entry.id,
        action: 'submitted',
        userId: FORM_LINK_ACTOR,
        metadata: {
          clientId: entry.clientId,
          name: entry.template.name,
          revision,
          filledBy: 'CLIENT',
        },
      },
      tx,
    );
  });
  return { ok: true as const };
}

export function problemMessage(problem: PublicFormProblem): string {
  switch (problem) {
    case 'expired':
      return 'Este link expirou. Peça um novo link para quem enviou.';
    case 'revoked':
      return 'Este link foi substituído ou cancelado. Peça um novo link para quem enviou.';
    case 'used':
      return 'Esta ficha já foi enviada. Obrigado! Se precisar mudar algo, fale com quem enviou.';
    default:
      return 'Link inválido. Confira se copiou o endereço completo.';
  }
}

// ---- Agenda: fichas exigidas no atendimento ------------------------------------------------------

export type AppointmentFormItem = {
  templateId: string;
  templateName: string;
  type: FormType;
  requirement: FormRequirement;
  fillableBy: FormFiller;
  source: 'service' | 'package_initial' | 'package_session';
  entry: { id: string; status: FormEntryStatus; submittedAt: Date | null } | null;
  met: boolean;
};

type RequiredTemplate = {
  templateId: string;
  templateName: string;
  type: FormType;
  version: {
    requirement: FormRequirement;
    fillableBy: FormFiller;
    renewal: FormRenewal;
    renewalDays: number | null;
  };
  source: AppointmentFormItem['source'];
  requestKey: string | null;
};

/**
 * Modelos que o atendimento pede: os ligados aos serviços (um modelo pedido por dois serviços
 * conta uma vez) e, se é sessão de pacote, a ficha inicial e a ficha de cada sessão.
 */
async function requiredTemplates(
  db: Db,
  companyId: string,
  appointment: { id: string; serviceId: string; clientPackageId: string | null },
): Promise<RequiredTemplate[]> {
  const items = await db.appointmentItem.findMany({
    where: { appointmentId: appointment.id },
    select: { serviceId: true },
  });
  const serviceIds = [...new Set([appointment.serviceId, ...items.map((i) => i.serviceId)])];
  const links = await db.formTemplateService.findMany({
    where: { companyId, serviceId: { in: serviceIds }, template: { status: 'ACTIVE' } },
    select: { templateId: true },
  });
  const wanted = new Map<
    string,
    { source: RequiredTemplate['source']; requestKey: string | null }
  >();
  for (const link of links) wanted.set(link.templateId, { source: 'service', requestKey: null });
  if (appointment.clientPackageId) {
    const pkg = await db.clientPackage.findFirst({
      where: { id: appointment.clientPackageId, companyId },
      select: { id: true, initialFormTemplateId: true, sessionFormTemplateId: true },
    });
    if (pkg?.initialFormTemplateId) {
      wanted.set(pkg.initialFormTemplateId, {
        source: 'package_initial',
        requestKey: `pkg:${pkg.id}:${pkg.initialFormTemplateId}`,
      });
    }
    if (pkg?.sessionFormTemplateId) {
      wanted.set(pkg.sessionFormTemplateId, {
        source: 'package_session',
        requestKey: `appt:${appointment.id}:${pkg.sessionFormTemplateId}`,
      });
    }
  }
  if (wanted.size === 0) return [];
  const templates = await db.formTemplate.findMany({
    where: { companyId, id: { in: [...wanted.keys()] }, status: 'ACTIVE' },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    orderBy: { name: 'asc' },
  });
  return templates
    .filter((t) => t.versions[0])
    .map((t) => ({
      templateId: t.id,
      templateName: t.name,
      type: t.type,
      version: t.versions[0],
      ...wanted.get(t.id)!,
    }));
}

async function evaluateAppointmentForms(
  db: Db,
  companyId: string,
  appointment: {
    id: string;
    clientId: string;
    serviceId: string;
    startAt: Date;
    clientPackageId: string | null;
  },
): Promise<AppointmentFormItem[]> {
  const required = await requiredTemplates(db, companyId, appointment);
  if (required.length === 0) return [];
  const entries = await db.formEntry.findMany({
    where: {
      companyId,
      clientId: appointment.clientId,
      templateId: { in: required.map((r) => r.templateId) },
    },
    select: {
      id: true,
      templateId: true,
      status: true,
      appointmentId: true,
      submittedAt: true,
      createdAt: true,
      requestKey: true,
    },
  });
  return required.map((r) => {
    const mine = entries.filter((e) => e.templateId === r.templateId);
    const current = r.requestKey
      ? (mine.find((e) => e.requestKey === r.requestKey) ?? null)
      : currentEntryFor(mine, r.version, {
          appointmentId: appointment.id,
          at: appointment.startAt,
        });
    return {
      templateId: r.templateId,
      templateName: r.templateName,
      type: r.type,
      requirement: r.version.requirement,
      fillableBy: r.version.fillableBy,
      source: r.source,
      entry: current
        ? { id: current.id, status: current.status, submittedAt: current.submittedAt }
        : null,
      met: requirementMet(r.version.requirement, current?.status ?? null),
    };
  });
}

async function findAppointment(db: Db, companyId: string, appointmentId: string) {
  const appointment = await db.appointment.findFirst({
    where: { id: appointmentId, companyId },
    select: {
      id: true,
      clientId: true,
      serviceId: true,
      startAt: true,
      clientPackageId: true,
      status: true,
    },
  });
  if (!appointment) throw new UserError('Agendamento não encontrado.');
  return appointment;
}

/**
 * Fichas do atendimento, para o painel da agenda. Com `ensure`, pede as que faltam (uma vez só:
 * abrir o painel de novo não cria outra).
 */
export async function getAppointmentForms(
  companyId: string,
  appointmentId: string,
  options: { ensure: boolean; userId: string },
) {
  const appointment = await findAppointment(prisma, companyId, appointmentId);
  let items = await evaluateAppointmentForms(prisma, companyId, appointment);
  const missing = items.filter((i) => !i.entry);
  if (options.ensure && missing.length && appointment.status !== 'CANCELED') {
    const required = await requiredTemplates(prisma, companyId, appointment);
    for (const item of missing) {
      const r = required.find((x) => x.templateId === item.templateId);
      if (!r) continue;
      await requestEntry({
        companyId,
        userId: options.userId,
        clientId: appointment.clientId,
        templateId: item.templateId,
        appointmentId: r.source === 'package_initial' ? null : appointment.id,
        clientPackageId: r.source === 'service' ? null : appointment.clientPackageId,
        requestKey: r.requestKey ?? undefined,
        source: 'auto',
      });
    }
    items = await evaluateAppointmentForms(prisma, companyId, appointment);
  }
  return items;
}

/**
 * Conferido no servidor ao iniciar o atendimento: a ficha exigida precisa estar enviada (ou
 * revisada, conforme o modelo). A mensagem diz qual ficha e o que falta.
 */
export async function assertAppointmentFormsReady(
  db: Db,
  companyId: string,
  appointmentId: string,
) {
  const appointment = await findAppointment(db, companyId, appointmentId);
  const items = await evaluateAppointmentForms(db, companyId, appointment);
  const pending = items.filter((i) => !i.met);
  if (pending.length === 0) return;
  const parts = pending.map(
    (i) =>
      `a ficha "${i.templateName}" ${missingRequirementText(i.requirement, i.entry?.status ?? null)}`,
  );
  throw new UserError(`Antes de iniciar o atendimento: ${parts.join('; ')}.`);
}

/**
 * Resumo por cliente (aba "Fichas e formulários"): status de todas, sem respostas. "Atualização
 * necessária" é calculada: a ficha mais recente de um modelo "a cada N dias" que já venceu.
 */
export async function listClientEntries(companyId: string, clientId: string) {
  const result = await listEntries(companyId, { clientId, pageSize: 50 });
  const now = Date.now();
  const latestByTemplate = new Map<string, string>();
  for (const e of result.entries) {
    if (!latestByTemplate.has(e.template.id)) latestByTemplate.set(e.template.id, e.id);
  }
  return {
    ...result,
    entries: result.entries.map((e) => ({
      ...e,
      updateDue:
        latestByTemplate.get(e.template.id) === e.id &&
        e.template.status === 'ACTIVE' &&
        e.renewal === 'AFTER_DAYS' &&
        !!e.submittedAt &&
        now - e.submittedAt.getTime() > (e.renewalDays ?? 365) * 86_400_000,
    })),
  };
}

/** Histórico de acesso de uma ficha (quem viu, enviou, revisou, exportou) — sem conteúdo. */
export async function listEntryAudit(companyId: string, access: FormAccess, entryId: string) {
  requireAccess(access, 'canAudit', 'ver o histórico de acesso das fichas');
  await loadEntry(prisma, companyId, entryId);
  return prisma.auditLog.findMany({
    where: { companyId, entityType: 'FormEntry', entityId: entryId },
    select: { id: true, action: true, userId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

/** Dados para o PDF: exige permissão de exportar e fica registrado. */
export async function getEntryForExport(companyId: string, access: FormAccess, entryId: string) {
  requireAccess(access, 'canExport', 'exportar fichas');
  const entry = await loadEntry(prisma, companyId, entryId);
  assertInScope(access, entry);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, timezone: true },
  });
  await recordAuditLog({
    companyId,
    entityType: 'FormEntry',
    entityId: entryId,
    action: 'exported',
    userId: access.userId,
    metadata: { clientId: entry.clientId, name: entry.template.name, format: 'pdf' },
  });
  return {
    companyName: company?.name ?? '',
    timezone: company?.timezone ?? 'America/Sao_Paulo',
    clientName: entry.client.name,
    formName: entry.template.name,
    templateType: entry.template.type,
    version: entry.version.version,
    status: entry.status,
    revision: entry.revision,
    filledBy: entry.filledBy,
    filledByUserId: entry.filledByUserId,
    reviewedByUserId: entry.reviewedByUserId,
    createdAt: entry.createdAt,
    submittedAt: entry.submittedAt,
    reviewedAt: entry.reviewedAt,
    appointmentAt: entry.appointment?.startAt ?? null,
    packageName: entry.clientPackage?.nameSnapshot ?? null,
    schema: schemaOf(entry),
    answers: answersOf(entry.answers),
  };
}

export type EntryExport = Awaited<ReturnType<typeof getEntryForExport>>;

// ---- Área do cliente: fichas a preencher e documentos liberados --------------------------------

/** Autor dos registros feitos pelo cliente na área do cliente. */
export const PORTAL_FORM_ACTOR = 'client-portal';
/** Link curto gerado na própria área do cliente (o cliente já está identificado pelo link pessoal). */
const PORTAL_FORM_LINK_HOURS = 2;

/** Fichas do cliente para a área do cliente: o que falta preencher e o que a equipe liberou. */
export async function listClientPortalForms(companyId: string, clientId: string) {
  const entries = await prisma.formEntry.findMany({
    where: {
      companyId,
      clientId,
      OR: [
        {
          status: { in: ['REQUESTED', 'DRAFT'] },
          version: { fillableBy: { not: 'PROFESSIONAL' } },
        },
        { status: { in: ['SUBMITTED', 'REVIEWED'] }, releasedToClientAt: { not: null } },
      ],
      template: { status: { not: 'ARCHIVED' } },
    },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      releasedToClientAt: true,
      template: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return {
    toFill: entries
      .filter((e) => e.status === 'REQUESTED' || e.status === 'DRAFT')
      .map((e) => ({ id: e.id, name: e.template.name, started: e.status === 'DRAFT' })),
    documents: entries
      .filter((e) => e.releasedToClientAt)
      .map((e) => ({
        id: e.id,
        name: e.template.name,
        submittedAt: e.submittedAt?.toISOString() ?? null,
      })),
  };
}

/**
 * O cliente, já identificado pelo link pessoal, abre uma ficha pedida para ele: gera um link de
 * preenchimento curto (o mesmo fluxo do link da ficha, com as mesmas regras).
 */
export async function createPortalFormLink(companyId: string, clientId: string, entryId: string) {
  const entry = await loadEntry(prisma, companyId, entryId);
  if (entry.clientId !== clientId) throw new UserError('Ficha não encontrada.');
  if (entry.status !== 'REQUESTED' && entry.status !== 'DRAFT') {
    throw new UserError('Esta ficha já foi enviada.');
  }
  if (entry.version.fillableBy === 'PROFESSIONAL') {
    throw new UserError('Esta ficha é preenchida pela equipe.');
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + PORTAL_FORM_LINK_HOURS * 3_600_000);
  await txRun(async (tx) => {
    await tx.formAccessToken.updateMany({
      where: { entryId, revokedAt: null, usedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.formAccessToken.create({
      data: {
        companyId,
        entryId,
        tokenHash: hashToken(token),
        expiresAt,
        createdByUserId: PORTAL_FORM_ACTOR,
      },
    });
    await recordAuditLog(
      {
        companyId,
        entityType: 'FormEntry',
        entityId: entryId,
        action: 'link_created',
        userId: PORTAL_FORM_ACTOR,
        metadata: { clientId, name: entry.template.name, expiresAt: expiresAt.toISOString() },
      },
      tx,
    );
  });
  return { token };
}

/**
 * Libera (ou recolhe) uma ficha enviada para o cliente ver na área do cliente. Só as seções do
 * cliente aparecem para ele — nunca as seções internas da equipe.
 */
export async function setEntryReleasedToClient(
  companyId: string,
  access: FormAccess,
  entryId: string,
  released: boolean,
) {
  requireAccess(access, 'canReview', 'liberar fichas para o cliente');
  const entry = await loadEntry(prisma, companyId, entryId);
  assertInScope(access, entry);
  if (released && entry.status !== 'SUBMITTED' && entry.status !== 'REVIEWED') {
    throw new UserError('Só fichas enviadas podem ser liberadas para o cliente.');
  }
  await prisma.formEntry.update({
    where: { id: entry.id },
    data: { releasedToClientAt: released ? new Date() : null },
  });
  await recordAuditLog({
    companyId,
    entityType: 'FormEntry',
    entityId: entry.id,
    action: released ? 'link_created' : 'link_revoked',
    userId: access.userId,
    metadata: { clientId: entry.clientId, releasedToClient: released },
  });
}

/** Documento liberado, como o cliente vê: só as seções do cliente, em texto. */
export async function getReleasedDocument(companyId: string, clientId: string, entryId: string) {
  const entry = await prisma.formEntry.findFirst({
    where: {
      id: entryId,
      companyId,
      clientId,
      releasedToClientAt: { not: null },
      status: { in: ['SUBMITTED', 'REVIEWED'] },
    },
    include: { version: true, template: { select: { name: true } } },
  });
  if (!entry) throw new UserError('Documento não encontrado.');
  const schema = schemaOf(entry);
  const answers = clientVisibleAnswers(schema, answersOf(entry.answers));
  await recordAuditLog({
    companyId,
    entityType: 'FormEntry',
    entityId: entry.id,
    action: 'viewed',
    userId: PORTAL_FORM_ACTOR,
    metadata: { clientId },
  });
  return {
    name: entry.template.name,
    submittedAt: entry.submittedAt?.toISOString() ?? null,
    sections: sectionsFor(schema, 'client').map((section) => ({
      title: section.title,
      rows: section.questions.map((q) => ({ label: q.title, value: answerText(q, answers[q.id]) })),
    })),
  };
}
