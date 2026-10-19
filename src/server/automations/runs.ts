import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import type { FeatureKey } from '@/lib/billing/plans';
import { getTodayInTz, calendarDateToUtc, utcToMinutesSinceMidnight } from '@/lib/time';
import { buildAiSession } from '@/server/ai/access';
import { canAutoExecute, type AuthorizationLimits } from '@/server/ai/autonomy';
import { hasFeature } from '@/server/billing/features';
import {
  getPreferences,
  routinePaused,
  type BusinessPreferencesData,
  type Routine,
} from '@/server/data/business-preferences';

/*
  Execuções das rotinas automáticas. Toda rotina passa pelo mesmo portão, conferido NA HORA de
  executar (nunca ao enfileirar): plano, modo "Executar regras autorizadas", autorização ativa
  por tipo de tarefa, limites da autorização e pausas. Cada execução fica registrada — inclusive
  as puladas, com o motivo — para a página de resultados.
*/

export const ROUTINE_FEATURE: Record<Exclude<Routine, 'daily_summary'>, FeatureKey> = {
  package_renewal: 'packageRenewal',
  waitlist_auto: 'waitlistAutomation',
};

export type RunStats = Record<string, number>;

export async function startRun(companyId: string, routine: Routine, trigger: 'cron' | 'manual') {
  return prisma.automationRun.create({
    data: { companyId, routine, trigger, status: 'RUNNING' },
  });
}

export async function finishRun(
  id: string,
  result: {
    status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
    stats?: RunStats;
    note?: string | null;
    aiUnits?: number;
  },
) {
  await prisma.automationRun.update({
    where: { id },
    data: {
      status: result.status,
      stats: (result.stats ?? {}) as Prisma.InputJsonValue,
      note: result.note ?? null,
      aiUnits: result.aiUnits ?? 0,
      finishedAt: new Date(),
    },
  });
}

/** Registra uma rotina pulada (com o motivo) sem executar nada. */
export async function recordSkip(
  companyId: string,
  routine: Routine,
  trigger: 'cron' | 'manual',
  note: string,
) {
  return prisma.automationRun.create({
    data: {
      companyId,
      routine,
      trigger,
      status: 'SKIPPED',
      note,
      finishedAt: new Date(),
    },
  });
}

export async function listRecentRuns(companyId: string, limit = 20) {
  const rows = await prisma.automationRun.findMany({
    where: { companyId },
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    routine: r.routine,
    trigger: r.trigger,
    status: r.status,
    stats: (r.stats ?? {}) as RunStats,
    note: r.note,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }));
}

export type GateResult =
  | {
      ok: true;
      prefs: BusinessPreferencesData;
      limits: AuthorizationLimits;
      scope: Record<string, unknown>;
      timezone: string;
    }
  | { ok: false; reason: string };

/**
 * Pode executar a rotina agora, nesta empresa? Revalida tudo do zero a cada execução: retomar
 * depois de uma pausa nunca dispara o que ficou para trás.
 */
export async function routineGate(
  companyId: string,
  routine: Exclude<Routine, 'daily_summary'>,
  now = new Date(),
): Promise<GateResult> {
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company) return { ok: false, reason: 'Empresa não encontrada.' };
  if (!hasFeature(company, ROUTINE_FEATURE[routine])) {
    return { ok: false, reason: 'O plano atual não inclui esta rotina.' };
  }
  const prefs = await getPreferences(companyId);
  if (routinePaused(prefs, routine)) {
    return { ok: false, reason: 'Pausada pelo administrador.' };
  }
  const authorization = await prisma.aiTaskAuthorization.findFirst({
    where: { companyId, taskType: routine, status: { not: 'REVOKED' } },
    orderBy: { createdAt: 'desc' },
  });
  const today = getTodayInTz(company.timezone);
  const executionsToday = await prisma.automationRun.count({
    where: {
      companyId,
      routine,
      status: { in: ['COMPLETED', 'PARTIAL'] },
      startedAt: { gte: calendarDateToUtc(today, 0, company.timezone) },
    },
  });
  const session = buildAiSession({ company, userId: 'automation', isAdmin: false, now });
  const decision = canAutoExecute({
    session,
    authorization: authorization
      ? {
          companyId: authorization.companyId,
          taskType: authorization.taskType,
          status: authorization.status,
          limits: (authorization.limits ?? null) as AuthorizationLimits | null,
          createdByUserId: authorization.createdByUserId,
        }
      : null,
    task: {
      type: routine,
      companyId,
      createdAt: now,
      localHour: Math.floor(utcToMinutesSinceMidnight(now, company.timezone) / 60),
    },
    executionsToday,
    now,
  });
  if (!decision.ok) return { ok: false, reason: decision.reason };
  return {
    ok: true,
    prefs,
    limits: (authorization?.limits ?? {}) as AuthorizationLimits,
    scope: (authorization?.scope ?? {}) as Record<string, unknown>,
    timezone: company.timezone,
  };
}
