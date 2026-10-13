import { timingSafeEqual } from 'node:crypto';
import { NextResponse, after, type NextRequest } from 'next/server';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { exchangeCode, isGoogleCalendarConfigured } from '@/server/google/client';
import { backfillConnection, saveConnection } from '@/server/data/google-calendar';

const STATE_COOKIE = 'gcal_oauth';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const done = (result: string) => {
    const response = NextResponse.redirect(new URL(`/agenda?google=${result}`, origin));
    response.cookies.delete({ name: STATE_COOKIE, path: '/api/google-calendar' });
    return response;
  };

  if (!isGoogleCalendarConfigured()) return done('unavailable');

  let session;
  try {
    session = await requireCurrentCompany();
  } catch {
    return NextResponse.redirect(new URL('/sign-in', origin));
  }

  const params = request.nextUrl.searchParams;
  // The user pressed "Cancelar" on Google's consent screen.
  if (params.get('error')) return done('denied');

  const code = params.get('code');
  const state = params.get('state');
  const [nonce, encodedIds] = (request.cookies.get(STATE_COOKIE)?.value ?? '').split('.');
  // CSRF check: the state Google echoes back must be the one we set in this browser.
  if (!code || !state || !nonce || !safeEqual(state, nonce)) return done('error');

  let professionalIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encodedIds ?? '', 'base64url').toString());
    if (Array.isArray(parsed)) professionalIds = parsed.filter((id) => typeof id === 'string');
  } catch {
    // A malformed cookie just means no professionals pre-selected.
  }

  try {
    const { refreshToken, email } = await exchangeCode(
      code,
      `${origin}/api/google-calendar/callback`,
    );
    const connection = await saveConnection({
      companyId: session.company.id,
      userId: session.userId,
      googleEmail: email,
      refreshToken,
      professionalIds,
    });
    // Copying the upcoming appointments can take a while; don't hold the redirect for it.
    after(() => backfillConnection(connection.id));
    return done('connected');
  } catch (error) {
    console.error('[google-calendar] connect failed', error);
    return done('error');
  }
}
