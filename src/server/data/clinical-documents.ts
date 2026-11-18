import { prisma } from '@/lib/db';
import { DOCUMENT_KINDS, type DocumentKind } from '@/lib/clinical-documents';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Prontuário, fase 3: documentos (receita, atestado, laudo...), anexos e convênio do paciente.
  Documento não se apaga nem se edita: anular deixa visível como anulado (com o motivo).
  Anexo pode ser excluído (o arquivo sai do armazenamento), e a exclusão fica no histórico.
*/

async function assertClient(companyId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, companyId },
    select: { id: true, name: true },
  });
  if (!client) throw new UserError('Paciente não encontrado.');
  return client;
}

export async function listClinicalDocuments(companyId: string, clientId: string) {
  return prisma.clinicalDocument.findMany({
    where: { companyId, clientId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      professionalName: true,
      professionalRegistry: true,
      authorName: true,
      createdAt: true,
      canceledAt: true,
      canceledByName: true,
      cancelReason: true,
    },
  });
}

export async function createClinicalDocument(params: {
  companyId: string;
  clientId: string;
  kind: string;
  title: string;
  body: string;
  professionalId: string;
  authorUserId: string;
  authorName: string;
}) {
  if (!(DOCUMENT_KINDS as readonly string[]).includes(params.kind)) {
    throw new UserError('Tipo de documento inválido.');
  }
  const body = params.body.trim();
  if (body.length < 3) throw new UserError('Escreva o conteúdo do documento.');
  if (body.length > 20_000) throw new UserError('O documento passou do tamanho máximo.');
  const title = params.title.trim().slice(0, 120) || 'Documento';
  await assertClient(params.companyId, params.clientId);
  const professional = await prisma.professional.findFirst({
    where: { id: params.professionalId, companyId: params.companyId },
    select: { id: true, name: true, registry: true },
  });
  if (!professional) throw new UserError('Escolha o profissional responsável.');
  const doc = await prisma.clinicalDocument.create({
    data: {
      companyId: params.companyId,
      clientId: params.clientId,
      kind: params.kind as DocumentKind,
      title,
      body,
      professionalId: professional.id,
      professionalName: professional.name,
      professionalRegistry: professional.registry,
      authorUserId: params.authorUserId,
      authorName: params.authorName,
    },
    select: { id: true },
  });
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'ClinicalDocument',
    entityId: doc.id,
    action: 'created',
    userId: params.authorUserId,
    metadata: { clientId: params.clientId, kind: params.kind, title },
  });
  return doc;
}

export async function cancelClinicalDocument(params: {
  companyId: string;
  clientId: string;
  id: string;
  reason: string;
  userId: string;
  userName: string;
}) {
  const reason = params.reason.trim();
  if (reason.length < 3) throw new UserError('Diga por que o documento está sendo anulado.');
  const updated = await prisma.clinicalDocument.updateMany({
    where: {
      id: params.id,
      companyId: params.companyId,
      clientId: params.clientId,
      canceledAt: null,
    },
    data: {
      canceledAt: new Date(),
      canceledByName: params.userName,
      cancelReason: reason.slice(0, 300),
    },
  });
  if (updated.count === 0) throw new UserError('Documento não encontrado ou já anulado.');
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'ClinicalDocument',
    entityId: params.id,
    action: 'canceled',
    userId: params.userId,
    metadata: { reason },
  });
}

/** Documento para imprimir: com o paciente e a empresa. */
export async function getDocumentForPrint(companyId: string, id: string) {
  const doc = await prisma.clinicalDocument.findFirst({
    where: { id, companyId },
    include: {
      client: { select: { id: true, name: true, cpf: true, birthDate: true } },
      company: { select: { name: true, clerkOrgId: true, timezone: true } },
    },
  });
  if (!doc) throw new UserError('Documento não encontrado.');
  return doc;
}

// ---- Convênio --------------------------------------------------------------------------------------

export async function updateClientInsurance(params: {
  companyId: string;
  clientId: string;
  name: string | null;
  number: string | null;
  plan: string | null;
}) {
  await assertClient(params.companyId, params.clientId);
  const clean = (v: string | null, max: number) => v?.trim().slice(0, max) || null;
  await prisma.client.update({
    where: { id: params.clientId },
    data: {
      insuranceName: clean(params.name, 80),
      insuranceNumber: clean(params.number, 40),
      insurancePlan: clean(params.plan, 80),
    },
  });
}

// ---- Anexos ----------------------------------------------------------------------------------------

export async function listAttachments(companyId: string, clientId: string) {
  return prisma.clientAttachment.findMany({
    where: { companyId, clientId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      name: true,
      contentType: true,
      sizeBytes: true,
      uploadedByName: true,
      createdAt: true,
    },
  });
}

export async function addAttachment(params: {
  companyId: string;
  clientId: string;
  name: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  userId: string;
  userName: string;
}) {
  await assertClient(params.companyId, params.clientId);
  const row = await prisma.clientAttachment.create({
    data: {
      companyId: params.companyId,
      clientId: params.clientId,
      name: params.name.trim().slice(0, 160) || 'Arquivo',
      storagePath: params.storagePath,
      contentType: params.contentType,
      sizeBytes: params.sizeBytes,
      uploadedByUserId: params.userId,
      uploadedByName: params.userName,
    },
    select: { id: true },
  });
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'ClientAttachment',
    entityId: row.id,
    action: 'created',
    userId: params.userId,
    metadata: { clientId: params.clientId, name: params.name },
  });
  return row;
}

export async function findAttachment(companyId: string, clientId: string, id: string) {
  const row = await prisma.clientAttachment.findFirst({
    where: { id, companyId, clientId },
    select: { id: true, name: true, storagePath: true, contentType: true },
  });
  if (!row) throw new UserError('Arquivo não encontrado.');
  return row;
}

/** Exclui o registro; devolve o caminho para o arquivo sair do armazenamento. */
export async function deleteAttachment(
  companyId: string,
  clientId: string,
  id: string,
  userId: string,
) {
  const row = await findAttachment(companyId, clientId, id);
  await prisma.clientAttachment.delete({ where: { id: row.id } });
  await recordAuditLog({
    companyId,
    entityType: 'ClientAttachment',
    entityId: row.id,
    action: 'deleted',
    userId,
    metadata: { clientId, name: row.name },
  });
  return row.storagePath;
}
