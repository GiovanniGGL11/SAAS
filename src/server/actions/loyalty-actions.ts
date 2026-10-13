'use server';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  addLoyaltyManually,
  getClientLoyalty,
  getLoyaltyProgram,
  listLoyaltyMembers,
  redeemLoyalty,
  saveLoyaltyProgram,
} from '@/server/data/loyalty';
import {
  adjustLoyaltyInput,
  loyaltyProgramInput,
  redeemLoyaltyInput,
} from '@/lib/validations/loyalty';
import { serializeLoyaltyEntry } from '@/lib/serialize';

export async function getLoyaltyOverviewAction() {
  const { company } = await requireCompanyAdmin();
  const [program, members] = await Promise.all([
    getLoyaltyProgram(company.id),
    listLoyaltyMembers(company.id),
  ]);
  return { program, members };
}

export async function saveLoyaltyProgramAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = loyaltyProgramInput.parse(input);
    const { company } = await requireCompanyAdmin();

    const program = await saveLoyaltyProgram(company.id, parsed);
    return program;
  });
}

export async function getClientLoyaltyAction(rawClientId: unknown) {
  const clientId = parseId(rawClientId);
  const { company } = await requireCurrentCompany();
  const loyalty = await getClientLoyalty(company.id, clientId);
  if (!loyalty) return null;
  return { ...loyalty, entries: loyalty.entries.map(serializeLoyaltyEntry) };
}

export async function redeemLoyaltyAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = redeemLoyaltyInput.parse(input);
    const { userId, company } = await requireCurrentCompany();

    await redeemLoyalty({
      companyId: company.id,
      clientId: parsed.clientId,
      createdByUserId: userId,
      cashbackAmount: parsed.amount,
    });
  });
}

export async function addLoyaltyManuallyAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = adjustLoyaltyInput.parse(input);
    const { userId, company } = await requireCompanyAdmin();

    await addLoyaltyManually({
      companyId: company.id,
      clientId: parsed.clientId,
      amount: parsed.amount,
      description: parsed.description,
      createdByUserId: userId,
    });
  });
}
