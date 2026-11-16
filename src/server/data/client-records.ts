import { prisma } from '@/lib/db';
import { UserError } from '@/server/errors';
import {
  CLIENT_SIGNED_URL_SECONDS,
  removePhotos,
  signedPhotoUrls,
} from '@/server/storage/supabase';

/*
  Registros de evolução do cliente: blocos por tratamento ("Limpeza de pele", "Depilação"), cada
  um com os dias de atendimento (anotação, anotação interna e fotos). A equipe vê tudo; o cliente
  vê pela área dele, sem a anotação interna e sem as fotos marcadas "só equipe".
*/

export type RecordPhotoView = {
  id: string;
  url: string | null;
  caption: string | null;
  staffOnly: boolean;
};

export type RecordEntryView = {
  id: string;
  /** AAAA-MM-DD */
  date: string;
  notes: string | null;
  internalNotes: string | null;
  photos: RecordPhotoView[];
};

export type RecordBlockView = {
  id: string;
  title: string;
  createdAt: string;
  entries: RecordEntryView[];
};

const dayString = (d: Date) => d.toISOString().slice(0, 10);

export async function listClientRecords(
  companyId: string,
  clientId: string,
  audience: 'staff' | 'client',
): Promise<RecordBlockView[]> {
  const forClient = audience === 'client';
  const blocks = await prisma.clientRecordBlock.findMany({
    where: { companyId, clientId },
    orderBy: { updatedAt: 'desc' },
    include: {
      entries: {
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        include: {
          photos: {
            where: forClient ? { staffOnly: false } : {},
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });
  // Links curtos para o cliente (10 min): a página gera novos sempre que é aberta.
  const urls = await signedPhotoUrls(
    blocks.flatMap((b) => b.entries.flatMap((e) => e.photos.map((p) => p.storagePath))),
    forClient ? CLIENT_SIGNED_URL_SECONDS : undefined,
  );
  return blocks.map((b) => ({
    id: b.id,
    title: b.title,
    createdAt: b.createdAt.toISOString(),
    entries: b.entries.map((e) => ({
      id: e.id,
      date: dayString(e.date),
      notes: e.notes,
      internalNotes: forClient ? null : e.internalNotes,
      photos: e.photos.map((p) => ({
        id: p.id,
        url: urls.get(p.storagePath) ?? null,
        caption: p.caption,
        staffOnly: p.staffOnly,
      })),
    })),
  }));
}

async function blockOf(companyId: string, blockId: string) {
  const block = await prisma.clientRecordBlock.findFirst({
    where: { id: blockId, companyId },
    select: { id: true, clientId: true },
  });
  if (!block) throw new UserError('Registro não encontrado.');
  return block;
}

export async function entryOf(companyId: string, entryId: string) {
  const entry = await prisma.clientRecordEntry.findFirst({
    where: { id: entryId, companyId },
    select: { id: true, blockId: true, block: { select: { clientId: true } } },
  });
  if (!entry) throw new UserError('Dia do registro não encontrado.');
  return { id: entry.id, blockId: entry.blockId, clientId: entry.block.clientId };
}

export async function clientOfBlock(companyId: string, blockId: string) {
  return (await blockOf(companyId, blockId)).clientId;
}

export async function clientOfPhoto(companyId: string, photoId: string) {
  const photo = await prisma.clientRecordPhoto.findFirst({
    where: { id: photoId, companyId },
    select: { entry: { select: { block: { select: { clientId: true } } } } },
  });
  if (!photo) throw new UserError('Foto não encontrada.');
  return photo.entry.block.clientId;
}

export async function createRecordBlock(
  companyId: string,
  clientId: string,
  title: string,
  userId: string,
) {
  const client = await prisma.client.findFirst({ where: { id: clientId, companyId } });
  if (!client) throw new UserError('Cliente não encontrado.');
  return prisma.clientRecordBlock.create({
    data: { companyId, clientId, title: title.trim(), createdByUserId: userId },
    select: { id: true },
  });
}

export async function renameRecordBlock(companyId: string, blockId: string, title: string) {
  await blockOf(companyId, blockId);
  await prisma.clientRecordBlock.update({ where: { id: blockId }, data: { title: title.trim() } });
}

export async function deleteRecordBlock(companyId: string, blockId: string) {
  await blockOf(companyId, blockId);
  const photos = await prisma.clientRecordPhoto.findMany({
    where: { companyId, entry: { blockId } },
    select: { storagePath: true },
  });
  await prisma.clientRecordBlock.delete({ where: { id: blockId } });
  await removePhotos(photos.map((p) => p.storagePath));
}

export type RecordEntryInput = {
  date: string;
  notes?: string | null;
  internalNotes?: string | null;
};

const toDate = (day: string) => new Date(`${day}T00:00:00.000Z`);

export async function createRecordEntry(
  companyId: string,
  blockId: string,
  input: RecordEntryInput,
  userId: string,
) {
  await blockOf(companyId, blockId);
  const entry = await prisma.clientRecordEntry.create({
    data: {
      companyId,
      blockId,
      date: toDate(input.date),
      notes: input.notes?.trim() || null,
      internalNotes: input.internalNotes?.trim() || null,
      createdByUserId: userId,
    },
    select: { id: true },
  });
  // O bloco com movimento mais recente sobe na lista.
  await prisma.clientRecordBlock.update({
    where: { id: blockId },
    data: { updatedAt: new Date() },
  });
  return entry;
}

export async function updateRecordEntry(
  companyId: string,
  entryId: string,
  input: RecordEntryInput,
) {
  await entryOf(companyId, entryId);
  await prisma.clientRecordEntry.update({
    where: { id: entryId },
    data: {
      date: toDate(input.date),
      notes: input.notes?.trim() || null,
      internalNotes: input.internalNotes?.trim() || null,
    },
  });
}

export async function deleteRecordEntry(companyId: string, entryId: string) {
  await entryOf(companyId, entryId);
  const photos = await prisma.clientRecordPhoto.findMany({
    where: { companyId, entryId },
    select: { storagePath: true },
  });
  await prisma.clientRecordEntry.delete({ where: { id: entryId } });
  await removePhotos(photos.map((p) => p.storagePath));
}

export async function addRecordPhoto(
  companyId: string,
  entryId: string,
  photo: {
    storagePath: string;
    contentType: string;
    sizeBytes: number;
    caption?: string | null;
    staffOnly: boolean;
  },
  userId: string,
) {
  await entryOf(companyId, entryId);
  return prisma.clientRecordPhoto.create({
    data: {
      companyId,
      entryId,
      storagePath: photo.storagePath,
      contentType: photo.contentType,
      sizeBytes: photo.sizeBytes,
      caption: photo.caption?.trim() || null,
      staffOnly: photo.staffOnly,
      createdByUserId: userId,
    },
    select: { id: true },
  });
}

export async function setRecordPhotoStaffOnly(
  companyId: string,
  photoId: string,
  staffOnly: boolean,
) {
  const result = await prisma.clientRecordPhoto.updateMany({
    where: { id: photoId, companyId },
    data: { staffOnly },
  });
  if (result.count === 0) throw new UserError('Foto não encontrada.');
}

export async function deleteRecordPhoto(companyId: string, photoId: string) {
  const photo = await prisma.clientRecordPhoto.findFirst({
    where: { id: photoId, companyId },
    select: { storagePath: true },
  });
  if (!photo) throw new UserError('Foto não encontrada.');
  await prisma.clientRecordPhoto.delete({ where: { id: photoId } });
  await removePhotos([photo.storagePath]);
}
