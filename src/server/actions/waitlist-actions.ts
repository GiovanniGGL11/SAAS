'use server';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  createWaitlistEntry,
  listWaitingEntries,
  setWaitlistEntryStatus,
} from '@/server/data/waitlist';
import { recordAuditLog } from '@/server/data/audit';
import { setWaitlistStatusInput, waitlistInput } from '@/lib/validations/waitlist';

export async function listWaitlistAction() {
  const { company } = await requireCurrentCompany();
  return listWaitingEntries(company.id, company.timezone);
}

export async function createWaitlistEntryAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = waitlistInput.parse(input);
    const { userId, company } = await requireCurrentCompany();

    const entry = await createWaitlistEntry(company.id, company.timezone, userId, parsed);
    await recordAuditLog({
      companyId: company.id,
      entityType: 'WaitlistEntry',
      entityId: entry.id,
      action: 'created',
      userId,
      metadata: { source: 'app', desiredDate: entry.desiredDate },
    });
    return entry;
  });
}

export async function setWaitlistStatusAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = setWaitlistStatusInput.parse(input);
    parseId(parsed.id);
    const { userId, company } = await requireCurrentCompany();

    await setWaitlistEntryStatus(company.id, parsed.id, parsed.status);
    await recordAuditLog({
      companyId: company.id,
      entityType: 'WaitlistEntry',
      entityId: parsed.id,
      action: parsed.status === 'CANCELED' ? 'canceled' : 'status_changed',
      userId,
      metadata: { source: 'app', status: parsed.status },
    });
  });
}
