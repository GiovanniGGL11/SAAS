import { NextResponse } from 'next/server';

import { UserError } from '@/server/errors';
import {
  UnauthenticatedError,
  NoActiveOrganizationError,
} from '@/server/auth/require-current-company';

/** Download autenticado: nada de cache, nada de indexação, sempre como anexo. */
export function pdfResponse(bytes: Uint8Array, filename: string) {
  const safe = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ._-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safe || 'documento'}.pdf"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/** Erro esperado vira resposta curta (sem conteúdo da ficha na mensagem). */
export function pdfError(error: unknown) {
  if (error instanceof UnauthenticatedError || error instanceof NoActiveOrganizationError) {
    return NextResponse.json({ error: 'Entre na sua conta para baixar.' }, { status: 401 });
  }
  if (error instanceof UserError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  throw error;
}
