'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';
import { isCompanyAdmin } from '@/server/auth/require-current-company';
import { requireFormAccess } from '@/server/auth/form-access';
import { assertFeature, hasFeature } from '@/server/billing/features';
import {
  getAppointmentOverview,
  recordExtraMaterial,
  setChecklistItem,
} from '@/server/data/appointment-overview';

export async function getAppointmentOverviewAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const session = await requireFormAccess();
    return getAppointmentOverview(session.company.id, id, {
      isAdmin: isCompanyAdmin(session),
      access: session.access,
      features: {
        checklists: hasFeature(session.company, 'checklists'),
        quotes: hasFeature(session.company, 'quotes'),
      },
    });
  });
}

const checklistInput = z.object({
  appointmentId: z.string().min(1).max(64),
  item: z.string().min(1).max(120),
  checked: z.boolean(),
});

export async function setChecklistItemAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = checklistInput.parse(input);
    const session = await requireFormAccess();
    assertFeature(session.company, 'checklists');
    await setChecklistItem({ companyId: session.company.id, userId: session.userId, ...parsed });
  });
}

const extraMaterialInput = z.object({
  appointmentId: z.string().min(1).max(64),
  productId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(1000),
});

export async function recordExtraMaterialAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = extraMaterialInput.parse(input);
    const session = await requireFormAccess();
    await recordExtraMaterial({ companyId: session.company.id, userId: session.userId, ...parsed });
  });
}
