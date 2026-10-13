'use server';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

import { z } from 'zod';

import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  listTomorrowReminders,
  markReminderSent,
  setCompanyRemindersByEmail,
} from '@/server/data/reminders';

export async function listTomorrowRemindersAction() {
  const { company } = await requireCurrentCompany();
  return listTomorrowReminders(company);
}

export async function markReminderSentAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company } = await requireCurrentCompany();
    await markReminderSent(company.id, id);
  });
}

export async function setRemindersByEmailAction(input: unknown) {
  return toActionResult(async () => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(input);
    const { company } = await requireCompanyAdmin();
    await setCompanyRemindersByEmail(company.id, enabled);
    return { enabled };
  });
}
