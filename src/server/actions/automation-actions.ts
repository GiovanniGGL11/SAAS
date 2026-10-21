'use server';

import { z } from 'zod';

import { prisma } from '@/lib/db';
import { toActionResult } from '@/server/action-result';
import { UserError } from '@/server/errors';
import {
  isCompanyAdmin,
  requireCompanyAdmin,
  requireCurrentCompany,
} from '@/server/auth/require-current-company';
import { assertFeature, hasFeature } from '@/server/billing/features';
import { buildAiSession } from '@/server/ai/access';
import { AUTOMATABLE_TASKS, createAuthorization } from '@/server/ai/autonomy';
import { getPreferences } from '@/server/data/business-preferences';
import {
  computeDailySummary,
  ensureAutomaticSummary,
  summaryForViewer,
  type DailySummaryContent,
} from '@/server/automations/daily-summary';
import { runPackageRenewal } from '@/server/automations/package-renewal';
import { runWaitlistAuto } from '@/server/automations/waitlist-auto';
import { getAutomationResults } from '@/server/automations/results';
import { listRecentRuns } from '@/server/automations/runs';

/** Resumo do dia: sob demanda (Profissional) ou o gerado no horário (Pro, quando ligado). */
export async function getDailySummaryAction() {
  return toActionResult(async () => {
    const session = await requireCurrentCompany();
    const { company } = session;
    assertFeature(company, 'dailySummary');
    const stored = await ensureAutomaticSummary(company.id, 'manual').catch(() => null);
    const content = stored
      ? (stored.content as unknown as DailySummaryContent)
      : await computeDailySummary(company.id, company.timezone);
    return {
      ...summaryForViewer(content, isCompanyAdmin(session)),
      generatedAt: stored?.generatedAt.toISOString() ?? new Date().toISOString(),
      automatic: Boolean(stored),
    };
  });
}

/** Página de automações: pausas, autorizações, o que está em andamento e as últimas execuções. */
export async function getAutomationOverviewAction() {
  return toActionResult(async () => {
    const session = await requireCurrentCompany();
    const { company } = session;
    const prefs = await getPreferences(company.id);
    const ai = buildAiSession({
      company,
      userId: session.userId,
      isAdmin: isCompanyAdmin(session),
    });
    const authorizations = await prisma.aiTaskAuthorization.findMany({
      where: { companyId: company.id, status: { not: 'REVOKED' } },
      orderBy: { createdAt: 'desc' },
    });
    // Em andamento: convites automáticos já feitos continuam valendo até o prazo.
    const inFlight = await prisma.waitlistOffer.findMany({
      where: {
        companyId: company.id,
        origin: 'automation',
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        startAt: true,
        expiresAt: true,
        entry: {
          select: { client: { select: { name: true } }, service: { select: { name: true } } },
        },
      },
      orderBy: { expiresAt: 'asc' },
      take: 20,
    });
    return {
      isAdmin: isCompanyAdmin(session),
      plan: {
        packageRenewal: hasFeature(company, 'packageRenewal'),
        waitlistAutomation: hasFeature(company, 'waitlistAutomation'),
        dailySummaryAuto: hasFeature(company, 'dailySummaryAuto'),
        results: hasFeature(company, 'automationResults'),
        rules: hasFeature(company, 'automationRules'),
      },
      autonomy: ai.autonomy.effective,
      autoExecutionAvailable: ai.entitlements.ai.available.autoExecution,
      paused: prefs.automationsPaused,
      pausedRoutines: prefs.pausedRoutines,
      dailySummaryAuto: prefs.dailySummaryAuto,
      tasks: Object.entries(AUTOMATABLE_TASKS).map(([type, task]) => {
        const auth = authorizations.find((a) => a.taskType === type);
        return {
          type,
          label: task.label,
          description: task.description,
          authorization: auth
            ? {
                id: auth.id,
                status: auth.status,
                limits: auth.limits as Record<string, unknown> | null,
                scope: auth.scope as Record<string, unknown> | null,
              }
            : null,
        };
      }),
      inFlight: inFlight.map((o) => ({
        id: o.id,
        client: o.entry.client.name,
        service: o.entry.service.name,
        startAt: o.startAt.toISOString(),
        expiresAt: o.expiresAt.toISOString(),
      })),
      runs: await listRecentRuns(company.id, 15),
    };
  });
}

/** Autorizar uma rotina (só administrador, só no Pro). A IA não tem ferramenta para isto. */
export async function createRoutineAuthorizationAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        taskType: z.enum(['package_renewal', 'waitlist_auto']),
        maxPerDay: z.number().int().min(1).max(50),
        allowedFrom: z.number().int().min(0).max(23),
        allowedTo: z.number().int().min(1).max(24),
        sendMessages: z.boolean().default(false),
      })
      .refine((v) => v.allowedFrom < v.allowedTo, 'O horário final precisa ser depois do inicial.')
      .parse(input);
    const session = await requireCompanyAdmin();
    const ai = buildAiSession({ company: session.company, userId: session.userId, isAdmin: true });
    const existing = await prisma.aiTaskAuthorization.findFirst({
      where: {
        companyId: session.company.id,
        taskType: parsed.taskType,
        status: { not: 'REVOKED' },
      },
    });
    if (existing) {
      throw new UserError('Esta rotina já tem autorização. Pause ou revogue antes de criar outra.');
    }
    await createAuthorization(ai, {
      taskType: parsed.taskType,
      scope: { sendMessages: parsed.taskType === 'waitlist_auto' && parsed.sendMessages },
      limits: {
        maxPerDay: parsed.maxPerDay,
        allowedHours: { from: parsed.allowedFrom, to: parsed.allowedTo },
        maxQueueAgeMs: 60 * 60_000,
      },
    });
  });
}

/** Rodar agora (administrador). Passa pelo mesmo portão da execução automática. */
export async function runRoutineNowAction(input: unknown) {
  return toActionResult(async () => {
    const { routine } = z
      .object({ routine: z.enum(['package_renewal', 'waitlist_auto']) })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    return routine === 'package_renewal'
      ? runPackageRenewal(company.id, 'manual')
      : runWaitlistAuto(company.id, 'manual');
  });
}

export async function getAutomationResultsAction(input: unknown) {
  return toActionResult(async () => {
    const { days } = z
      .object({ days: z.number().int().min(7).max(180).default(30) })
      .parse(input ?? {});
    const { company } = await requireCompanyAdmin();
    assertFeature(company, 'automationResults');
    return getAutomationResults(company.id, days);
  });
}
