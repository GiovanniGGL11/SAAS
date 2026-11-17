'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { UserError } from '@/server/errors';
import { isCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { canSeeClient } from '@/server/auth/professional-scope';
import { isStorageConfigured } from '@/server/storage/supabase';
import {
  clientOfBlock,
  clientOfPhoto,
  createRecordBlock,
  createRecordEntry,
  deleteRecordBlock,
  deleteRecordEntry,
  deleteRecordPhoto,
  entryOf,
  listClientRecords,
  renameRecordBlock,
  setRecordPhotoStaffOnly,
  updateRecordEntry,
} from '@/server/data/client-records';

/*
  Registros de evolução (aba "Registros" do cliente). Quem pode ver o cliente pode registrar; o
  profissional com login próprio só nos clientes que atende. Apagar um bloco inteiro é do admin.
*/

const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const entryInput = z.object({
  date: day,
  notes: z.string().max(5000).nullable().optional(),
  internalNotes: z.string().max(5000).nullable().optional(),
});

async function sessionFor(clientId: string) {
  const session = await requireCurrentCompany();
  if (!(await canSeeClient(clientId))) throw new UserError('Cliente não encontrado.');
  return session;
}

export async function listClientRecordsAction(rawClientId: unknown) {
  return toActionResult(async () => {
    const clientId = id.parse(rawClientId);
    const { company } = await sessionFor(clientId);
    return {
      blocks: await listClientRecords(company.id, clientId, 'staff'),
      photosEnabled: isStorageConfigured(),
    };
  });
}

export async function createRecordBlockAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ clientId: id, title: z.string().trim().min(1, 'Dê um nome ao registro.').max(120) })
      .parse(input);
    const { company, userId } = await sessionFor(parsed.clientId);
    return createRecordBlock(company.id, parsed.clientId, parsed.title, userId);
  });
}

export async function renameRecordBlockAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ blockId: id, title: z.string().trim().min(1).max(120) }).parse(input);
    const { company } = await requireCurrentCompany();
    await sessionFor(await clientOfBlock(company.id, parsed.blockId));
    await renameRecordBlock(company.id, parsed.blockId, parsed.title);
  });
}

export async function deleteRecordBlockAction(rawBlockId: unknown) {
  return toActionResult(async () => {
    const blockId = id.parse(rawBlockId);
    const session = await requireCurrentCompany();
    if (!isCompanyAdmin(session))
      throw new UserError('Só administradores apagam um registro inteiro.');
    await deleteRecordBlock(session.company.id, blockId);
  });
}

export async function createRecordEntryAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = entryInput.extend({ blockId: id }).parse(input);
    const { company, userId } = await requireCurrentCompany();
    await sessionFor(await clientOfBlock(company.id, parsed.blockId));
    return createRecordEntry(company.id, parsed.blockId, parsed, userId);
  });
}

export async function updateRecordEntryAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = entryInput.extend({ entryId: id }).parse(input);
    const { company } = await requireCurrentCompany();
    await sessionFor((await entryOf(company.id, parsed.entryId)).clientId);
    await updateRecordEntry(company.id, parsed.entryId, parsed);
  });
}

export async function deleteRecordEntryAction(rawEntryId: unknown) {
  return toActionResult(async () => {
    const entryId = id.parse(rawEntryId);
    const { company } = await requireCurrentCompany();
    await sessionFor((await entryOf(company.id, entryId)).clientId);
    await deleteRecordEntry(company.id, entryId);
  });
}

export async function setRecordPhotoStaffOnlyAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ photoId: id, staffOnly: z.boolean() }).parse(input);
    const { company } = await requireCurrentCompany();
    await sessionFor(await clientOfPhoto(company.id, parsed.photoId));
    await setRecordPhotoStaffOnly(company.id, parsed.photoId, parsed.staffOnly);
  });
}

export async function deleteRecordPhotoAction(rawPhotoId: unknown) {
  return toActionResult(async () => {
    const photoId = id.parse(rawPhotoId);
    const { company } = await requireCurrentCompany();
    await sessionFor(await clientOfPhoto(company.id, photoId));
    await deleteRecordPhoto(company.id, photoId);
  });
}
