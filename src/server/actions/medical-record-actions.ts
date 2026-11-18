'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { currentUser } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import { toActionResult } from '@/server/action-result';
import { UserError, parseId } from '@/server/errors';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { requireFormAccess } from '@/server/auth/form-access';
import { canSeeClient, getOwnProfessional } from '@/server/auth/professional-scope';
import { requireAccess } from '@/server/data/form-permissions';
import {
  createClinicalNote,
  getMedicalRecordHeader,
  listClinicalNotes,
} from '@/server/data/medical-records';
import {
  getTreatmentPlan,
  markProcedureDone,
  pendingSessions,
  undoProcedureDone,
} from '@/server/data/treatment-plan';
import {
  cancelClinicalDocument,
  createClinicalDocument,
  deleteAttachment,
  findAttachment,
  listAttachments,
  listClinicalDocuments,
  updateClientInsurance,
} from '@/server/data/clinical-documents';
import {
  isStorageConfigured,
  removeAttachment,
  signedAttachmentUrl,
} from '@/server/storage/supabase';
import { summarizeMedicalRecord } from '@/server/ai/medical-summary';
import { DOCUMENT_KINDS } from '@/lib/clinical-documents';
import { SEGMENT_GROUPS } from '@/lib/onboarding/templates';
import { evolutionTemplates, medicalRecordsEnabled } from '@/lib/medical-records';

/*
  Prontuário: só nas empresas com ele ligado (pelo ramo ou em Configurações). Ler e escrever exige
  a permissão de ler as respostas das fichas (os mesmos dados de saúde); a profissional com login
  próprio só abre o prontuário de quem ela atende.
*/

async function requireRecordAccess(clientId: string) {
  const session = await requireFormAccess();
  if (!medicalRecordsEnabled(session.company)) {
    throw new UserError('O prontuário não está ligado. Ligue em Configurações › Prontuário.');
  }
  requireAccess(session.access, 'canRead', 'ver o prontuário');
  if (!(await canSeeClient(clientId))) throw new UserError('Paciente não encontrado.');
  return session;
}

/** Prontuário ligado nesta empresa (para a agenda mostrar o atalho). */
export async function getMedicalRecordsEnabledAction() {
  const { company } = await requireCurrentCompany();
  return medicalRecordsEnabled(company);
}

export async function getMedicalRecordAction(rawClientId: unknown) {
  return toActionResult(async () => {
    const clientId = parseId(rawClientId);
    const { company, access } = await requireRecordAccess(clientId);
    const [header, notes, plan] = await Promise.all([
      getMedicalRecordHeader(company.id, clientId),
      listClinicalNotes(company.id, clientId, access),
      getTreatmentPlan(company.id, clientId),
    ]);
    return {
      ...header,
      notes,
      plan,
      pendingSessions: pendingSessions(plan),
      templates: evolutionTemplates(company.segment),
    };
  });
}

/** Nome de quem está usando (para "feito por" e "escrito por"). */
async function currentUserName() {
  const user = await currentUser();
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    'Equipe'
  );
}

const procedureRef = z.object({
  quoteId: z.string().min(1).max(64),
  itemIndex: z.number().int().min(0).max(100),
});

export async function addClinicalNoteAction(input: unknown) {
  return toActionResult(async () => {
    const data = z
      .object({
        clientId: z.string().min(1).max(64),
        text: z.string().max(20_000),
        appointmentId: z.string().min(1).max(64).nullish(),
        amendsId: z.string().min(1).max(64).nullish(),
        /** Procedimentos do plano feitos neste atendimento (marcados junto com a evolução). */
        procedures: z.array(procedureRef).max(30).optional(),
      })
      .parse(input);
    const { company, access } = await requireRecordAccess(data.clientId);
    const authorName = await currentUserName();
    // Confere os procedimentos ANTES de salvar a evolução (para não salvar só metade).
    if (data.procedures?.length) {
      const plan = await getTreatmentPlan(company.id, data.clientId);
      const asked = new Map<string, number>();
      for (const p of data.procedures) {
        const key = `${p.quoteId}:${p.itemIndex}`;
        asked.set(key, (asked.get(key) ?? 0) + 1);
        const item = plan
          .find((q) => q.quoteId === p.quoteId)
          ?.items.find((i) => i.itemIndex === p.itemIndex);
        if (!item || item.viaPackage || item.done + (asked.get(key) ?? 0) > item.total) {
          throw new UserError(
            item
              ? `"${item.description}" não tem mais sessões para marcar.`
              : 'Procedimento não encontrado no plano deste paciente.',
          );
        }
      }
    }
    const note = await createClinicalNote({
      companyId: company.id,
      clientId: data.clientId,
      text: data.text,
      appointmentId: data.appointmentId,
      amendsId: data.amendsId,
      authorUserId: access.userId,
      authorName,
    });
    for (const p of data.procedures ?? []) {
      await markProcedureDone({
        companyId: company.id,
        clientId: data.clientId,
        quoteId: p.quoteId,
        itemIndex: p.itemIndex,
        userId: access.userId,
        userName: authorName,
        appointmentId: data.appointmentId,
        clinicalNoteId: note.id,
      });
    }
    revalidatePath(`/clientes/${data.clientId}/prontuario`);
    return note;
  });
}

/** Plano de tratamento: marca uma sessão feita de um procedimento. */
export async function markProcedureDoneAction(input: unknown) {
  return toActionResult(async () => {
    const data = procedureRef
      .extend({
        clientId: z.string().min(1).max(64),
        note: z.string().max(500).nullish(),
      })
      .parse(input);
    const { company, access } = await requireRecordAccess(data.clientId);
    return markProcedureDone({
      companyId: company.id,
      clientId: data.clientId,
      quoteId: data.quoteId,
      itemIndex: data.itemIndex,
      userId: access.userId,
      userName: await currentUserName(),
      note: data.note,
    });
  });
}

/** Plano de tratamento: desfaz uma sessão marcada por engano. */
export async function undoProcedureDoneAction(input: unknown) {
  return toActionResult(async () => {
    const { clientId, id } = z
      .object({ clientId: z.string().min(1).max(64), id: z.string().min(1).max(64) })
      .parse(input);
    const { company, access } = await requireRecordAccess(clientId);
    await undoProcedureDone(company.id, clientId, id, access.userId);
  });
}

const SEGMENT_VALUES = SEGMENT_GROUPS.flatMap((g) => g.items.map((i) => i.value)) as [
  string,
  ...string[],
];

/** Configurações › Prontuário: o ramo do negócio e se o prontuário fica ligado. */
export async function saveMedicalRecordsSettingsAction(input: unknown) {
  return toActionResult(async () => {
    const data = z
      .object({
        segment: z.enum(SEGMENT_VALUES).nullable(),
        mode: z.enum(['auto', 'on', 'off']),
      })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    await prisma.company.update({
      where: { id: company.id },
      data: { segment: data.segment, medicalRecordsMode: data.mode === 'auto' ? null : data.mode },
    });
    revalidatePath('/', 'layout');
  });
}

// ---- Fase 3: documentos, convênio e anexos -------------------------------------------------------

/** Documentos do paciente e os profissionais que podem assinar (o da pessoa logada primeiro). */
export async function listDocumentsAction(rawClientId: unknown) {
  return toActionResult(async () => {
    const clientId = parseId(rawClientId);
    const { company } = await requireRecordAccess(clientId);
    const [documents, professionals, own] = await Promise.all([
      listClinicalDocuments(company.id, clientId),
      prisma.professional.findMany({
        where: { companyId: company.id, active: true },
        select: { id: true, name: true, registry: true },
        orderBy: { name: 'asc' },
      }),
      getOwnProfessional(),
    ]);
    return {
      documents,
      professionals,
      defaultProfessionalId: own?.id ?? professionals[0]?.id ?? null,
    };
  });
}

export async function createDocumentAction(input: unknown) {
  return toActionResult(async () => {
    const data = z
      .object({
        clientId: z.string().min(1).max(64),
        kind: z.enum(DOCUMENT_KINDS),
        title: z.string().max(120),
        body: z.string().max(20_000),
        professionalId: z.string().min(1).max(64),
      })
      .parse(input);
    const { company, access } = await requireRecordAccess(data.clientId);
    const doc = await createClinicalDocument({
      companyId: company.id,
      ...data,
      authorUserId: access.userId,
      authorName: await currentUserName(),
    });
    return doc;
  });
}

export async function cancelDocumentAction(input: unknown) {
  return toActionResult(async () => {
    const data = z
      .object({
        clientId: z.string().min(1).max(64),
        id: z.string().min(1).max(64),
        reason: z.string().max(300),
      })
      .parse(input);
    const { company, access } = await requireRecordAccess(data.clientId);
    await cancelClinicalDocument({
      companyId: company.id,
      ...data,
      userId: access.userId,
      userName: await currentUserName(),
    });
  });
}

export async function updateInsuranceAction(input: unknown) {
  return toActionResult(async () => {
    const data = z
      .object({
        clientId: z.string().min(1).max(64),
        name: z.string().max(80).nullable(),
        number: z.string().max(40).nullable(),
        plan: z.string().max(80).nullable(),
      })
      .parse(input);
    const { company } = await requireRecordAccess(data.clientId);
    await updateClientInsurance({ companyId: company.id, ...data });
  });
}

export async function listAttachmentsAction(rawClientId: unknown) {
  return toActionResult(async () => {
    const clientId = parseId(rawClientId);
    const { company } = await requireRecordAccess(clientId);
    return {
      attachments: await listAttachments(company.id, clientId),
      storage: isStorageConfigured(),
    };
  });
}

/** Link temporário (5 min) para abrir ou baixar um anexo. */
export async function attachmentLinkAction(input: unknown) {
  return toActionResult(async () => {
    const { clientId, id, download } = z
      .object({
        clientId: z.string().min(1).max(64),
        id: z.string().min(1).max(64),
        download: z.boolean().optional(),
      })
      .parse(input);
    const { company } = await requireRecordAccess(clientId);
    const row = await findAttachment(company.id, clientId, id);
    return { url: await signedAttachmentUrl(row.storagePath, download ? row.name : undefined) };
  });
}

/** Resumo do prontuário com IA (gasta créditos de IA do plano; não fica salvo). */
export async function summarizeMedicalRecordAction(rawClientId: unknown) {
  return toActionResult(async () => {
    const clientId = parseId(rawClientId);
    const { company, access } = await requireRecordAccess(clientId);
    return summarizeMedicalRecord({ company, clientId, access });
  });
}

export async function deleteAttachmentAction(input: unknown) {
  return toActionResult(async () => {
    const { clientId, id } = z
      .object({ clientId: z.string().min(1).max(64), id: z.string().min(1).max(64) })
      .parse(input);
    const { company, access } = await requireRecordAccess(clientId);
    const path = await deleteAttachment(company.id, clientId, id, access.userId);
    await removeAttachment(path);
  });
}
