import { NextResponse, type NextRequest } from 'next/server';

import {
  PORTAL_COOKIE,
  PORTAL_COOKIE_MAX_AGE,
  getCompanyOfStaleToken,
  getPortalSession,
} from '@/server/data/client-portal';

/**
 * O link pessoal que a equipe manda no WhatsApp. Abrir conecta o cliente neste aparelho (cookie)
 * e leva para a área do cliente; o endereço curto com o token não fica na barra do navegador.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origin = request.nextUrl.origin;

  const session = await getPortalSession(token);
  if (!session) {
    // Link trocado por um novo (ou cliente desativado): oferece pedir outro à empresa certa.
    const company = await getCompanyOfStaleToken(token);
    const target = company ? `/cliente/entrar/${company.slug}?expirado=1` : '/cliente?invalido=1';
    return NextResponse.redirect(new URL(target, origin));
  }

  const response = NextResponse.redirect(new URL('/cliente', origin));
  response.cookies.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: PORTAL_COOKIE_MAX_AGE,
  });
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
