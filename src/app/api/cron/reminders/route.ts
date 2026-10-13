import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { sendEmailReminders } from '@/server/data/reminders';
import { isEmailConfigured, sendEmail } from '@/server/email';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Lembretes da véspera por e-mail. A Vercel chama esta rota todo dia (vercel.json) mandando
 * `Authorization: Bearer $CRON_SECRET`; sem o segredo configurado a rota fica fechada.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado.' }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: 'RESEND_API_KEY / RESEND_FROM não configurados.' },
      { status: 503 },
    );
  }

  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? `https://${new URL(request.url).host}`
  ).replace(/\/$/, '');
  const result = await sendEmailReminders(sendEmail, baseUrl);
  return NextResponse.json(result);
}
