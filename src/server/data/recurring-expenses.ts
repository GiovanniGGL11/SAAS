import { prisma } from '@/lib/db';
import type { PaymentMethod, RecurringExpense } from '@/generated/prisma/client';
import { calendarDateToUtc } from '@/lib/time';
import { currentMonthKey, daysInMonth, parseMonthKey, shiftMonth } from '@/lib/month';
import { UserError } from '@/server/errors';

export type RecurringExpenseInput = {
  description: string;
  category?: string | null;
  amount: number;
  dayOfMonth: number;
  paymentMethod?: PaymentMethod | null;
};

export async function listRecurringExpenses(companyId: string): Promise<RecurringExpense[]> {
  return prisma.recurringExpense.findMany({
    where: { companyId },
    orderBy: [{ active: 'desc' }, { dayOfMonth: 'asc' }, { description: 'asc' }],
  });
}

export async function createRecurringExpense(
  companyId: string,
  data: RecurringExpenseInput,
  timezone: string,
  userId: string,
): Promise<RecurringExpense> {
  const expense = await prisma.recurringExpense.create({
    data: {
      companyId,
      description: data.description.trim(),
      category: data.category || null,
      amount: data.amount,
      dayOfMonth: data.dayOfMonth,
      paymentMethod: data.paymentMethod ?? null,
    },
  });
  await ensureRecurringTransactions(companyId, timezone, userId);
  return expense;
}

/**
 * Mudar a conta fixa vale para as próximas: as contas deste mês e do próximo que ainda estão
 * pendentes são atualizadas; as já pagas ficam como foram.
 */
export async function updateRecurringExpense(
  companyId: string,
  id: string,
  data: RecurringExpenseInput,
  timezone: string,
): Promise<void> {
  const result = await prisma.recurringExpense.updateMany({
    where: { id, companyId },
    data: {
      description: data.description.trim(),
      category: data.category || null,
      amount: data.amount,
      dayOfMonth: data.dayOfMonth,
      paymentMethod: data.paymentMethod ?? null,
    },
  });
  if (result.count === 0) throw new UserError('Conta fixa não encontrada.');

  const pending = await prisma.transaction.findMany({
    where: { companyId, recurringExpenseId: id, status: 'PENDING' },
    select: { id: true, recurringMonth: true },
  });
  for (const t of pending) {
    await prisma.transaction.update({
      where: { id: t.id },
      data: {
        description: data.description.trim(),
        category: data.category || null,
        amount: data.amount,
        paymentMethod: data.paymentMethod ?? null,
        dueDate: t.recurringMonth
          ? dueDateFor(t.recurringMonth, data.dayOfMonth, timezone)
          : undefined,
      },
    });
  }
}

/** Pausar a conta fixa cancela as que ainda não foram pagas; reativar volta a gerar. */
export async function setRecurringExpenseActive(
  companyId: string,
  id: string,
  active: boolean,
  timezone: string,
  userId: string,
): Promise<void> {
  const result = await prisma.recurringExpense.updateMany({
    where: { id, companyId },
    data: { active },
  });
  if (result.count === 0) throw new UserError('Conta fixa não encontrada.');
  if (!active) {
    await prisma.transaction.updateMany({
      where: { companyId, recurringExpenseId: id, status: 'PENDING' },
      data: { status: 'CANCELED' },
    });
  } else {
    // As deste mês em diante, canceladas pela pausa, voltam a ficar pendentes.
    await prisma.transaction.updateMany({
      where: {
        companyId,
        recurringExpenseId: id,
        status: 'CANCELED',
        recurringMonth: { gte: currentMonthKey(timezone) },
      },
      data: { status: 'PENDING' },
    });
    await ensureRecurringTransactions(companyId, timezone, userId);
  }
}

function dueDateFor(month: string, dayOfMonth: number, timezone: string): Date {
  const { year, month: m } = parseMonthKey(month);
  // Dia 31 em fevereiro vence no último dia do mês.
  const day = Math.min(dayOfMonth, daysInMonth(month));
  return calendarDateToUtc({ year, month: m, day }, 12 * 60, timezone);
}

/**
 * Lança as contas fixas deste mês e do próximo como pendentes, uma vez só por mês — o índice
 * único (conta, mês) garante isso mesmo com duas telas abertas ao mesmo tempo. Uma conta
 * cancelada à mão não volta.
 */
export async function ensureRecurringTransactions(
  companyId: string,
  timezone: string,
  userId = 'system',
): Promise<void> {
  const expenses = await prisma.recurringExpense.findMany({ where: { companyId, active: true } });
  if (expenses.length === 0) return;
  const thisMonth = currentMonthKey(timezone);
  const months = [thisMonth, shiftMonth(thisMonth, 1)];
  await prisma.transaction.createMany({
    data: expenses.flatMap((expense) =>
      months
        // Começa no primeiro vencimento depois do cadastro: criada no dia 14 com vencimento no
        // dia 10, a deste mês já foi paga por fora — não nasce "vencida".
        .filter(
          (month) =>
            dueDateFor(month, expense.dayOfMonth, timezone).getTime() >=
            expense.createdAt.getTime() - 86_400_000,
        )
        .map((month) => ({
          companyId,
          type: 'EXPENSE' as const,
          status: 'PENDING' as const,
          description: expense.description,
          category: expense.category,
          amount: expense.amount,
          paymentMethod: expense.paymentMethod,
          dueDate: dueDateFor(month, expense.dayOfMonth, timezone),
          recurringExpenseId: expense.id,
          recurringMonth: month,
          createdByUserId: userId,
        })),
    ),
    skipDuplicates: true,
  });
}
