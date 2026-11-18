import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';

import {
  NoActiveOrganizationError,
  UnauthenticatedError,
} from '@/server/auth/require-current-company';
import { requireFormAccess } from '@/server/auth/form-access';
import { canSeeClient } from '@/server/auth/professional-scope';
import { requireAccess } from '@/server/data/form-permissions';
import { UserError } from '@/server/errors';
import { addAttachment } from '@/server/data/clinical-documents';
import { medicalRecordsEnabled } from '@/lib/medical-records';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  StorageError,
  isStorageConfigured,
  uploadAttachment,
} from '@/server/storage/supabase';

/*
  Anexo do prontuário (exame, documento de fora): PDF ou imagem até 4 MB, no armazenamento
  PRIVADO. Mesmas travas do prontuário: ligado na empresa, permissão de ler as fichas e, para a
  profissional com login próprio, só pacientes dela.
*/

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  try {
    const { company, access } = await requireFormAccess();
    if (!medicalRecordsEnabled(company)) return fail('O prontuário não está ligado.', 403);
    requireAccess(access, 'canRead', 'anexar arquivos ao prontuário');
    if (!isStorageConfigured()) return fail('O envio de arquivos ainda não está configurado.', 503);

    const form = await request.formData().catch(() => null);
    const clientId = String(form?.get('clientId') ?? '').slice(0, 64);
    const file = form?.get('file');
    if (!clientId || !(file instanceof File)) return fail('Escolha o arquivo.');
    if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
      return fail('Envie em PDF, JPG, PNG ou WebP.');
    }
    if (file.size > ATTACHMENT_MAX_BYTES) return fail('O arquivo passa de 4 MB.');
    if (!(await canSeeClient(clientId))) return fail('Paciente não encontrado.', 404);

    const user = await currentUser();
    const userName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
      user?.primaryEmailAddress?.emailAddress ||
      'Equipe';
    const path = `${company.id}/${clientId}/${randomUUID()}.${EXT[file.type]}`;
    await uploadAttachment(path, Buffer.from(await file.arrayBuffer()), file.type);
    const row = await addAttachment({
      companyId: company.id,
      clientId,
      name: String(form?.get('name') ?? '').trim() || file.name,
      storagePath: path,
      contentType: file.type,
      sizeBytes: file.size,
      userId: access.userId,
      userName,
    });
    return NextResponse.json({ id: row.id });
  } catch (error) {
    if (error instanceof UnauthenticatedError || error instanceof NoActiveOrganizationError) {
      return fail('Entre na sua conta para enviar arquivos.', 401);
    }
    if (error instanceof UserError || error instanceof StorageError) return fail(error.message);
    console.error('[anexos]', error);
    return fail('Não foi possível enviar o arquivo agora. Tente de novo.', 500);
  }
}
