import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { buildAuthUrl, isGoogleCalendarConfigured } from '@/server/google/client';

const STATE_COOKIE = 'gcal_oauth';

/** Where the user lands after Google's consent screen; also what we register in Google Cloud. */
function callbackUrl(request: NextRequest): string {
  return `${request.nextUrl.origin}/api/google-calendar/callback`;
}

export async function GET(request: NextRequest) {
  const back = (result: string) =>
    NextResponse.redirect(new URL(`/agenda?google=${result}`, request.nextUrl.origin));

  if (!isGoogleCalendarConfigured()) return back('unavailable');

  // Anyone not signed in (or without an active company) is bounced by the dashboard layout
  // after this redirect; here we only need to know there is a session.
  try {
    await requireCurrentCompany();
  } catch {
    return NextResponse.redirect(new URL('/sign-in', request.nextUrl.origin));
  }

  // Professionals are only validated against the company in the callback, after the OAuth
  // round-trip, so what travels in the cookie is just a request.
  const professionalIds = (request.nextUrl.searchParams.get('professionals') ?? '')
    .split(',')
    .filter(Boolean)
    .slice(0, 50);

  const nonce = randomBytes(24).toString('base64url');
  const response = NextResponse.redirect(buildAuthUrl(callbackUrl(request), nonce));
  response.cookies.set(
    STATE_COOKIE,
    `${nonce}.${Buffer.from(JSON.stringify(professionalIds)).toString('base64url')}`,
    {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/api/google-calendar',
      maxAge: 600,
    },
  );
  return response;
}
