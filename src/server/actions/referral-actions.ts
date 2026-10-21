'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { assertFeature } from '@/server/billing/features';
import {
  REFERRAL_CONDITIONS,
  cancelReferral,
  createReferral,
  grantReward,
  listReferrals,
} from '@/server/data/referrals';

/* Indicações (Profissional+). Recompensas mexem com benefício: só administradores. */

const id = z.string().min(1).max(64);

async function session() {
  const s = await requireCompanyAdmin();
  assertFeature(s.company, 'referrals');
  return s;
}

export async function listReferralsAction() {
  return toActionResult(async () => {
    const { company } = await session();
    return listReferrals(company.id);
  });
}

export async function createReferralAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        referrerId: id,
        referredId: id,
        condition: z.enum(Object.keys(REFERRAL_CONDITIONS) as [keyof typeof REFERRAL_CONDITIONS]),
        rewardDescription: z.string().max(200).nullish(),
      })
      .parse(input);
    const { company, userId } = await session();
    const referral = await createReferral(company.id, userId, parsed);
    return { id: referral.id };
  });
}

export async function grantReferralRewardAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, note: z.string().max(300) }).parse(input);
    const { company, userId } = await session();
    await grantReward(company.id, userId, parsed.id, parsed.note);
  });
}

export async function cancelReferralAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, reason: z.string().max(300) }).parse(input);
    const { company, userId } = await session();
    await cancelReferral(company.id, userId, parsed.id, parsed.reason);
  });
}
