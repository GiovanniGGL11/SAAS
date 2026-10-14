'use server';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

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
import {
  addFinanceCategory,
  getPaymentFees,
  listFinanceCategories,
  removeFinanceCategory,
  savePaymentFees,
} from '@/server/data/finance-settings';
import {
  createRecurringExpense,
  ensureRecurringTransactions,
  listRecurringExpenses,
  setRecurringExpenseActive,
  updateRecurringExpense,
} from '@/server/data/recurring-expenses';
import { exportMonthCsv, getIncomeStatement } from '@/server/data/income-statement';
import { currentMonthKey } from '@/lib/month';

export async function listTransactionsAction(input: unknown) {
  const parsed = z
    .object({
      type: z.enum(['INCOME', 'EXPENSE']).optional(),
      status: z.enum(['PENDING', 'PAID', 'CANCELED']).optional(),
    })
    .parse(input);
  const { userId, company } = await requireCompanyAdmin();
  await ensureRecurringTransactions(company.id, company.timezone, userId);

  const transactions = await listTransactions(company.id, {
    type: parsed.type,
    status: parsed.status,
  });
  return transactions.map((t) => ({ ...serializeTransaction(t), appointment: t.appointment }));
}

export async function getCashFlowSummaryAction(input: unknown) {
  const parsed = reportPresetInput.parse(input);
  const { userId, company } = await requireCompanyAdmin();
  await ensureRecurringTransactions(company.id, company.timezone, userId);
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
    return serializeTransaction(transaction);
  });
}

export async function updateTransactionAction(rawId: unknown, input: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const parsed = transactionInput.parse(input);
    const { company } = await requireCompanyAdmin();

    const transaction = await updateTransaction(company.id, id, parsed);
    return serializeTransaction(transaction);
  });
}

export async function markTransactionPaidAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company } = await requireCompanyAdmin();
    await markTransactionPaid(company.id, id);
  });
}

export async function cancelTransactionAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company } = await requireCompanyAdmin();
    await cancelTransaction(company.id, id);
  });
}

const paymentMethodEnum = z.enum([
  'CASH',
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'BANK_TRANSFER',
  'OTHER',
]);
const monthInput = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.')
  .optional();

// ---- Taxas por forma de pagamento ----------------------------------------------------------

export async function getPaymentFeesAction() {
  const { company } = await requireCompanyAdmin();
  return getPaymentFees(company.id);
}

export async function savePaymentFeesAction(input: unknown) {
  return toActionResult(async () => {
    const fees = z
      .array(
        z.object({
          paymentMethod: paymentMethodEnum,
          feePercent: z
            .number()
            .min(0, 'A taxa não pode ser negativa.')
            .max(30, 'Taxa acima de 30%? Confira.'),
          settlementDays: z.number().int().min(0).max(120, 'Prazo de até 120 dias.'),
        }),
      )
      .max(6)
      .parse(input);
    const { company } = await requireCompanyAdmin();
    await savePaymentFees(company.id, fees);
  });
}

// ---- Categorias ------------------------------------------------------------------------------

export async function listFinanceCategoriesAction() {
  const { company } = await requireCompanyAdmin();
  return listFinanceCategories(company.id);
}

const categoryInput = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  name: z.string().trim().min(1, 'Informe o nome da categoria.').max(60),
});

export async function addFinanceCategoryAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = categoryInput.parse(input);
    const { company } = await requireCompanyAdmin();
    await addFinanceCategory(company.id, parsed.type, parsed.name);
  });
}

export async function removeFinanceCategoryAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = categoryInput.parse(input);
    const { company } = await requireCompanyAdmin();
    await removeFinanceCategory(company.id, parsed.type, parsed.name);
  });
}

// ---- Contas fixas ----------------------------------------------------------------------------

const recurringInput = z.object({
  description: z.string().trim().min(1, 'Informe a descrição.').max(200),
  category: z.string().max(60).nullable().optional(),
  amount: z.number().positive('O valor deve ser maior que zero.').max(9_999_999),
  dayOfMonth: z.number().int().min(1, 'Dia de 1 a 31.').max(31, 'Dia de 1 a 31.'),
  paymentMethod: paymentMethodEnum.nullable().optional(),
});

export async function listRecurringExpensesAction() {
  const { company } = await requireCompanyAdmin();
  const rows = await listRecurringExpenses(company.id);
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function createRecurringExpenseAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = recurringInput.parse(input);
    const { userId, company } = await requireCompanyAdmin();
    await createRecurringExpense(company.id, parsed, company.timezone, userId);
  });
}

export async function updateRecurringExpenseAction(rawId: unknown, input: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const parsed = recurringInput.parse(input);
    const { company } = await requireCompanyAdmin();
    await updateRecurringExpense(company.id, id, parsed, company.timezone);
  });
}

export async function setRecurringExpenseActiveAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id: z.string().min(1).max(64), active: z.boolean() }).parse(input);
    const { userId, company } = await requireCompanyAdmin();
    await setRecurringExpenseActive(company.id, parsed.id, parsed.active, company.timezone, userId);
  });
}

// ---- DRE e exportação ------------------------------------------------------------------------

export async function getIncomeStatementAction(input: unknown) {
  const parsed = z.object({ month: monthInput }).parse(input);
  const { company } = await requireCompanyAdmin();
  return getIncomeStatement(
    company.id,
    company.timezone,
    parsed.month ?? currentMonthKey(company.timezone),
  );
}

export async function exportMonthCsvAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ month: monthInput }).parse(input);
    const { company } = await requireCompanyAdmin();
    const month = parsed.month ?? currentMonthKey(company.timezone);
    return {
      filename: `financeiro-${company.slug}-${month}.csv`,
      csv: await exportMonthCsv(company.id, company.timezone, month),
    };
  });
}
