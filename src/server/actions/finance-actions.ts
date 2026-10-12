'use server';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

import { revalidatePath } from 'next/cache';

import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import {
  cancelTransaction,
  createTransaction,
  getCashFlowSummary,
  listTransactions,
  markTransactionPaid,
  updateTransaction,
} from '@/server/data/finance';
import { transactionInput } from '@/lib/validations/finance';
import { serializeTransaction } from '@/lib/serialize';
import { resolveReportRange } from '@/lib/report-range';
import { reportPresetInput, type ReportPreset } from '@/lib/validations/report';
import { z } from 'zod';

export async function listTransactionsAction(input: unknown) {
  const parsed = z
    .object({
      type: z.enum(['INCOME', 'EXPENSE']).optional(),
      status: z.enum(['PENDING', 'PAID', 'CANCELED']).optional(),
    })
    .parse(input);
  const { company } = await requireCompanyAdmin();

  const transactions = await listTransactions(company.id, {
    type: parsed.type,
    status: parsed.status,
  });
  return transactions.map((t) => ({ ...serializeTransaction(t), appointment: t.appointment }));
}

export async function getCashFlowSummaryAction(input: unknown) {
  const parsed = reportPresetInput.parse(input);
  const { company } = await requireCompanyAdmin();
  const range = resolveReportRange(parsed.preset as ReportPreset, company.timezone);
  return getCashFlowSummary(company.id, range);
}

export async function createTransactionAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = transactionInput.parse(input);
    const { userId, company } = await requireCompanyAdmin();

    const transaction = await createTransaction(
      company.id,
      { ...parsed, paidAt: parsed.status === 'PAID' ? new Date() : null },
      userId,
    );
    revalidatePath('/financeiro');
    return serializeTransaction(transaction);
  });
}

export async function updateTransactionAction(rawId: unknown, input: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const parsed = transactionInput.parse(input);
    const { company } = await requireCompanyAdmin();

    const transaction = await updateTransaction(company.id, id, parsed);
    revalidatePath('/financeiro');
    return serializeTransaction(transaction);
  });
}

export async function markTransactionPaidAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company } = await requireCompanyAdmin();
    await markTransactionPaid(company.id, id);
    revalidatePath('/financeiro');
  });
}

export async function cancelTransactionAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company } = await requireCompanyAdmin();
    await cancelTransaction(company.id, id);
    revalidatePath('/financeiro');
  });
}
