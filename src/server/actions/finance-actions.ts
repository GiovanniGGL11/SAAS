'use server';

import { revalidatePath } from 'next/cache';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
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
  const { company } = await requireCurrentCompany();

  const transactions = await listTransactions(company.id, {
    type: parsed.type,
    status: parsed.status,
  });
  return transactions.map((t) => ({ ...serializeTransaction(t), appointment: t.appointment }));
}

export async function getCashFlowSummaryAction(input: unknown) {
  const parsed = reportPresetInput.parse(input);
  const { company } = await requireCurrentCompany();
  const range = resolveReportRange(parsed.preset as ReportPreset, company.timezone);
  return getCashFlowSummary(company.id, range);
}

export async function createTransactionAction(input: unknown) {
  const parsed = transactionInput.parse(input);
  const { userId, company } = await requireCurrentCompany();

  const transaction = await createTransaction(
    company.id,
    { ...parsed, paidAt: parsed.status === 'PAID' ? new Date() : null },
    userId,
  );
  revalidatePath('/financeiro');
  return serializeTransaction(transaction);
}

export async function updateTransactionAction(id: string, input: unknown) {
  const parsed = transactionInput.parse(input);
  const { company } = await requireCurrentCompany();

  const transaction = await updateTransaction(company.id, id, {
    ...parsed,
    paidAt: parsed.status === 'PAID' ? new Date() : null,
  });
  revalidatePath('/financeiro');
  return serializeTransaction(transaction);
}

export async function markTransactionPaidAction(id: string) {
  const { company } = await requireCurrentCompany();
  await markTransactionPaid(company.id, id);
  revalidatePath('/financeiro');
}

export async function cancelTransactionAction(id: string) {
  const { company } = await requireCurrentCompany();
  await cancelTransaction(company.id, id);
  revalidatePath('/financeiro');
}
