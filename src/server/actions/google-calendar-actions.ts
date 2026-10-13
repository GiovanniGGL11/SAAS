'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  disconnectGoogleCalendar,
  getConnectionStatus,
  setConnectionProfessionals,
} from '@/server/data/google-calendar';
import { isGoogleCalendarConfigured } from '@/server/google/client';
import { idSchema } from '@/server/errors';

export async function getGoogleCalendarStatusAction() {
  const { userId, company } = await requireCurrentCompany();
  return {
    configured: isGoogleCalendarConfigured(),
    ...(await getConnectionStatus(company.id, userId)),
  };
}

export async function setGoogleCalendarProfessionalsAction(input: unknown) {
  return toActionResult(async () => {
    const professionalIds = z.array(idSchema).max(50).parse(input);
    const { userId, company } = await requireCurrentCompany();
    await setConnectionProfessionals(company.id, userId, professionalIds);
    return { ok: true };
  });
}

export async function disconnectGoogleCalendarAction() {
  return toActionResult(async () => {
    const { userId, company } = await requireCurrentCompany();
    await disconnectGoogleCalendar(company.id, userId);
    return { ok: true };
  });
}
