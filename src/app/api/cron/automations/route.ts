import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { runPackageRenewal } from '@/server/automations/package-renewal';
import { runWaitlistAuto } from '@/server/automations/waitlist-auto';
import { ensureAutomaticSummary } from '@/server/automations/daily-summary';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Rotinas automáticas (Pro). Só entram empresas com autorização ativa (renovação, lista de
 * espera) ou com o resumo automático ligado; cada rotina confere de novo plano, modo, autorização,
 * limites e pausa antes de agir. Chamada pela Vercel (vercel.json) com `Bearer $CRON_SECRET`.
 * Limite do plano da Vercel: uma vez por dia — por isso o resumo também é gerado ao abrir o painel
 * depois da hora configurada.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado.' }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const authorizations = await prisma.aiTaskAuthorization.findMany({
    where: { status: 'ACTIVE', company: { deletedAt: null } },
    select: { companyId: true, taskType: true },
  });
  const results: Record<string, unknown>[] = [];
  for (const auth of authorizations) {
    try {
      if (auth.taskType === 'package_renewal') {
        results.push({
          routine: auth.taskType,
          ...(await runPackageRenewal(auth.companyId, 'cron')),
        });
      } else if (auth.taskType === 'waitlist_auto') {
        results.push({
          routine: auth.taskType,
          ...(await runWaitlistAuto(auth.companyId, 'cron')),
        });
      }
    } catch (error) {
      results.push({ routine: auth.taskType, status: 'FAILED' });
      console.error('[cron automações]', auth.taskType, error);
    }
  }
  const summaries = await prisma.businessPreferences.findMany({
    where: { dailySummaryAuto: true, company: { deletedAt: null } },
    select: { companyId: true },
  });
  let summariesGenerated = 0;
  for (const s of summaries) {
    const row = await ensureAutomaticSummary(s.companyId, 'cron').catch(() => null);
    if (row) summariesGenerated++;
  }
  // Só contagens na resposta: nada de dado de cliente.
  return NextResponse.json({
    routines: results.length,
    skipped: results.filter((r) => r.status === 'SKIPPED').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    summariesGenerated,
  });
}
