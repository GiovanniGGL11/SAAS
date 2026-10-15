'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import {
  closeCommission,
  createAdvance,
  deleteAdvance,
  getCommissionOverview,
  reopenCommission,
} from '@/server/data/commissions';
import { currentMonthKey, monthLabel, monthRange } from '@/lib/month';

const paymentMethod = z.enum([
  'CASH',
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'BANK_TRANSFER',
  'OTHER',
]);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.');

export async function getCommissionOverviewAction(input: unknown) {
  const parsed = z.object({ month: month.optional() }).parse(input);
  const { company } = await requireCompanyAdmin();
  const key = parsed.month ?? currentMonthKey(company.timezone);
  return getCommissionOverview(company.id, monthRange(key, company.timezone));
}

export async function createAdvanceAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        professionalId: z.string().min(1).max(64),
        amount: z.number().positive('Informe o valor do vale.').max(999_999),
        description: z.string().max(200).optional(),
        paymentMethod,
      })
      .parse(input);
    const { userId, company } = await requireCompanyAdmin();
    await createAdvance({ companyId: company.id, ...parsed, userId });
    revalidatePath('/financeiro');
  });
}

export async function deleteAdvanceAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company } = await requireCompanyAdmin();
    await deleteAdvance(company.id, id);
  });
}

export async function closeCommissionAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ professionalId: z.string().min(1).max(64), month, paymentMethod })
      .parse(input);
    const { userId, company } = await requireCompanyAdmin();
    const result = await closeCommission({
      companyId: company.id,
      professionalId: parsed.professionalId,
      range: monthRange(parsed.month, company.timezone),
      paymentMethod: parsed.paymentMethod,
      userId,
      label: monthLabel(parsed.month),
    });
    revalidatePath('/financeiro');
    return result;
  });
}

export async function reopenCommissionAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company } = await requireCompanyAdmin();
    await reopenCommission(company.id, id);
  });
}
