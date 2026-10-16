import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { sendEmailReminders } from '@/server/data/reminders';
import { isEmailConfigured, sendEmail } from '@/server/email';
import { runDailyWhatsapp } from '@/server/whatsapp/automation';
import { releaseExpiredDeposits } from '@/server/billing/deposit';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Lembretes da véspera (e-mail e WhatsApp automático) e parabéns de aniversário. A Vercel chama esta rota todo dia (vercel.json) mandando
 * `Authorization: Bearer $CRON_SECRET`; sem o segredo configurado a rota fica fechada.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado.' }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? `https://${new URL(request.url).host}`
  ).replace(/\/$/, '');
  // WhatsApp automático (Z-API) não depende do e-mail: roda sempre que alguma empresa ligou.
  const whatsapp = await runDailyWhatsapp(baseUrl);
  // Sinais PIX vencidos que ninguém abriu a agenda para liberar.
  const depositCompanies = await prisma.company.findMany({
    where: { depositPercent: { gt: 0 }, deletedAt: null },
    select: { id: true },
  });
  let depositsReleased = 0;
  for (const c of depositCompanies)
    depositsReleased += await releaseExpiredDeposits(c.id, 200).catch(() => 0);
  const email = isEmailConfigured()
    ? await sendEmailReminders(sendEmail, baseUrl)
    : { skipped: 'RESEND_API_KEY / RESEND_FROM não configurados.' };
  return NextResponse.json({ email, whatsapp, depositsReleased });
}
