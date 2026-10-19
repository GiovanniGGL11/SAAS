'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { hasFeature } from '@/server/billing/features';
import {
  ROUTINES,
  getPreferences,
  preferencesInput,
  savePreferences,
  setAutomationPause,
} from '@/server/data/business-preferences';
import { listRecentRuns } from '@/server/automations/runs';

/** Preferências do negócio: só administradores leem e alteram (a IA não tem acesso a isto). */
export async function getPreferencesAction() {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    const prefs = await getPreferences(company.id);
    return {
      ...prefs,
      pausedAt: prefs.pausedAt?.toISOString() ?? null,
      plan: {
        dailySummaryAuto: hasFeature(company, 'dailySummaryAuto'),
        automations:
          hasFeature(company, 'packageRenewal') || hasFeature(company, 'waitlistAutomation'),
      },
    };
  });
}

export async function savePreferencesAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = preferencesInput.parse(input);
    const { company, userId } = await requireCompanyAdmin();
    await savePreferences(company.id, userId, parsed);
  });
}

/** Pausar/retomar as ações automáticas (geral ou uma rotina). Retomar não executa o atrasado. */
export async function setAutomationPauseAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ routine: z.enum([...ROUTINES, 'all']), paused: z.boolean() })
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    await setAutomationPause({ companyId: company.id, userId, ...parsed });
  });
}

export async function getAutomationStatusAction() {
  return toActionResult(async () => {
    const { company } = await requireCurrentCompany();
    const prefs = await getPreferences(company.id);
    return {
      paused: prefs.automationsPaused,
      pausedRoutines: prefs.pausedRoutines,
      runs: await listRecentRuns(company.id, 10),
    };
  });
}
