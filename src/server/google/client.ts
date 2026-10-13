import { decryptSecret } from '@/server/google/crypto';

// `calendar.events` is the narrowest scope that can create/edit/delete events:
// it can't read the user's other calendars or their settings.
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** The user revoked access or the refresh token expired — they have to reconnect. */
export class GoogleAuthRevokedError extends Error {
  constructor() {
    super('Google access was revoked.');
    this.name = 'GoogleAuthRevokedError';
  }
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  );
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    // offline + consent: Google only returns a refresh token on a consented, offline grant.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function postToken(body: Record<string, string>) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, string | number>;
  return { ok: response.ok, json };
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { ok, json } = await postToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  if (!ok || typeof json.refresh_token !== 'string') {
    throw new Error(`Google token exchange failed: ${json.error ?? 'no refresh token'}`);
  }

  // The id_token arrives straight from Google's token endpoint over TLS, so its
  // payload can be read without verifying the signature.
  let email = '';
  if (typeof json.id_token === 'string') {
    const payload = JSON.parse(Buffer.from(json.id_token.split('.')[1], 'base64url').toString());
    email = String(payload.email ?? '');
  }
  return { refreshToken: json.refresh_token, email };
}

async function refreshAccessToken(refreshTokenEnc: string): Promise<string> {
  const { ok, json } = await postToken({
    grant_type: 'refresh_token',
    refresh_token: decryptSecret(refreshTokenEnc),
  });
  if (!ok) {
    if (json.error === 'invalid_grant') throw new GoogleAuthRevokedError();
    throw new Error(`Google token refresh failed: ${json.error}`);
  }
  return String(json.access_token);
}

export async function revokeRefreshToken(refreshTokenEnc: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: decryptSecret(refreshTokenEnc) }),
  });
}

export type GoogleEventInput = {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  timeZone: string;
  /** When set, lets Google link back to the appointment if the user wants to reopen it. */
  sourceUrl?: string;
};

function toGoogleEvent(event: GoogleEventInput) {
  return {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.start.toISOString(), timeZone: event.timeZone },
    end: { dateTime: event.end.toISOString(), timeZone: event.timeZone },
    ...(event.sourceUrl ? { source: { title: 'Atendafy', url: event.sourceUrl } } : {}),
  };
}

/** A Google Calendar session for one connection: one token refresh, many calls. */
export async function openCalendarSession(refreshTokenEnc: string) {
  const accessToken = await refreshAccessToken(refreshTokenEnc);
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  return {
    async createEvent(event: GoogleEventInput): Promise<string> {
      const response = await fetch(EVENTS_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(toGoogleEvent(event)),
      });
      if (!response.ok) throw new Error(`Google create event failed: ${response.status}`);
      return ((await response.json()) as { id: string }).id;
    },

    /** Returns false when the event no longer exists (the user deleted it in Google). */
    async updateEvent(eventId: string, event: GoogleEventInput): Promise<boolean> {
      const response = await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(toGoogleEvent(event)),
      });
      if (response.status === 404 || response.status === 410) return false;
      if (!response.ok) throw new Error(`Google update event failed: ${response.status}`);
      return true;
    },

    async deleteEvent(eventId: string): Promise<void> {
      const response = await fetch(`${EVENTS_URL}/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers,
      });
      // Already gone is the outcome we wanted.
      if (!response.ok && response.status !== 404 && response.status !== 410) {
        throw new Error(`Google delete event failed: ${response.status}`);
      }
    },
  };
}
