'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { currentUser } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import { toActionResult } from '@/server/action-result';
import { UserError, parseId } from '@/server/errors';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { requireFormAccess } from '@/server/auth/form-access';
import { canSeeClient } from '@/server/auth/professional-scope';
import { requireAccess } from '@/server/data/form-permissions';
import {
  createClinicalNote,
  getMedicalRecordHeader,
  listClinicalNotes,
} from '@/server/data/medical-records';
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
    const [header, notes] = await Promise.all([
      getMedicalRecordHeader(company.id, clientId),
      listClinicalNotes(company.id, clientId, access),
    ]);
    return { ...header, notes, templates: evolutionTemplates(company.segment) };
  });
}

export async function addClinicalNoteAction(input: unknown) {
  return toActionResult(async () => {
    const data = z
      .object({
        clientId: z.string().min(1).max(64),
        text: z.string().max(20_000),
        appointmentId: z.string().min(1).max(64).nullish(),
        amendsId: z.string().min(1).max(64).nullish(),
      })
      .parse(input);
    const { company, access } = await requireRecordAccess(data.clientId);
    const user = await currentUser();
    const authorName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
      user?.primaryEmailAddress?.emailAddress ||
      'Equipe';
    const note = await createClinicalNote({
      companyId: company.id,
      clientId: data.clientId,
      text: data.text,
      appointmentId: data.appointmentId,
      amendsId: data.amendsId,
      authorUserId: access.userId,
      authorName,
    });
    revalidatePath(`/clientes/${data.clientId}/prontuario`);
    return note;
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
