import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

import {
  NoActiveOrganizationError,
  UnauthenticatedError,
  requireCurrentCompany,
} from '@/server/auth/require-current-company';
import { canSeeClient } from '@/server/auth/professional-scope';
import { UserError } from '@/server/errors';
import { addRecordPhoto, entryOf } from '@/server/data/client-records';
import {
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  StorageError,
  isStorageConfigured,
  uploadPhoto,
} from '@/server/storage/supabase';

/*
  Foto do dia de um registro de evolução. O navegador já reduz a foto (lado maior 1600 px);
  aqui ela vai para o armazenamento privado e fica ligada ao dia do registro.
*/

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  try {
    const { company, userId } = await requireCurrentCompany();
    if (!isStorageConfigured()) return fail('O envio de fotos ainda não está configurado.', 503);
    const form = await request.formData().catch(() => null);
    const entryId = String(form?.get('entryId') ?? '').slice(0, 64);
    const file = form?.get('file');
    if (!entryId || !(file instanceof File)) return fail('Escolha a foto.');
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
      return fail('Envie a foto em JPG, PNG ou WebP.');
    }
    if (file.size > PHOTO_MAX_BYTES) return fail('A foto passa de 5 MB.');
    const entry = await entryOf(company.id, entryId);
    if (!(await canSeeClient(entry.clientId))) return fail('Cliente não encontrado.', 404);

    const path = `${company.id}/${entry.clientId}/${entry.id}/${randomUUID()}.${EXT[file.type]}`;
    await uploadPhoto(path, Buffer.from(await file.arrayBuffer()), file.type);
    const photo = await addRecordPhoto(
      company.id,
      entry.id,
      {
        storagePath: path,
        contentType: file.type,
        sizeBytes: file.size,
        caption: String(form?.get('caption') ?? '').slice(0, 300) || null,
        staffOnly: form?.get('staffOnly') === 'true',
      },
      userId,
    );
    return NextResponse.json({ id: photo.id });
  } catch (error) {
    if (error instanceof UnauthenticatedError || error instanceof NoActiveOrganizationError) {
      return fail('Entre na sua conta para enviar fotos.', 401);
    }
    if (error instanceof UserError || error instanceof StorageError) return fail(error.message);
    console.error('[registros/fotos]', error);
    return fail('Não foi possível enviar a foto agora. Tente de novo.', 500);
  }
}
