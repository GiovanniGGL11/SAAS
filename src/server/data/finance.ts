import { prisma } from '@/lib/db';
import type {
  Appointment,
  PaymentMethod,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@/generated/prisma/client';

export type TransactionInput = {
  type: TransactionType;
  description: string;
  category?: string | null;
  amount: number;
  paymentMethod?: PaymentMethod | null;
  status: TransactionStatus;
  dueDate?: Date | null;
  paidAt?: Date | null;
  notes?: string | null;
};

export type TransactionWithAppointment = Transaction & {
  appointment: { id: string; clientId: string } | null;
};

export async function listTransactions(
  companyId: string,
  filters?: { type?: TransactionType; status?: TransactionStatus; range?: { startAt: Date; endAt: Date } },
): Promise<TransactionWithAppointment[]> {
  return prisma.transaction.findMany({
    where: {
      companyId,
      ...(filters?.type ? { type: filters.type } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.range
        ? { createdAt: { gte: filters.range.startAt, lte: filters.range.endAt } }
        : {}),
    },
    include: { appointment: { select: { id: true, clientId: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createTransaction(
  companyId: string,
  data: TransactionInput,
  createdByUserId: string,
): Promise<Transaction> {
  return prisma.transaction.create({
    data: {
      companyId,
      type: data.type,
      status: data.status,
      description: data.description,
      category: data.category || null,
      amount: data.amount,
      paymentMethod: data.paymentMethod ?? null,
      dueDate: data.dueDate ?? null,
      paidAt: data.paidAt ?? null,
      notes: data.notes || null,
      createdByUserId,
    },
  });
}

export async function updateTransaction(
  companyId: string,
  id: string,
  data: TransactionInput,
): Promise<Transaction> {
  const result = await prisma.transaction.updateMany({
    where: { id, companyId },
    data: {
      type: data.type,
      status: data.status,
      description: data.description,
      category: data.category || null,
      amount: data.amount,
      paymentMethod: data.paymentMethod ?? null,
      dueDate: data.dueDate ?? null,
      paidAt: data.paidAt ?? null,
      notes: data.notes || null,
    },
  });
  if (result.count === 0) throw new Error('Transaction not found');

  return (await prisma.transaction.findFirst({ where: { id, companyId } }))!;
}

export async function markTransactionPaid(companyId: string, id: string): Promise<void> {
  const result = await prisma.transaction.updateMany({
    where: { id, companyId },
    data: { status: 'PAID', paidAt: new Date() },
  });
  if (result.count === 0) throw new Error('Transaction not found');
}

export async function cancelTransaction(companyId: string, id: string): Promise<void> {
  const result = await prisma.transaction.updateMany({
    where: { id, companyId },
    data: { status: 'CANCELED' },
  });
  if (result.count === 0) throw new Error('Transaction not found');
}

export type CashFlowSummary = {
  income: number;
  expense: number;
  balance: number;
  pendingReceivables: number;
  pendingPayables: number;
};

export async function getCashFlowSummary(
  companyId: string,
  range: { startAt: Date; endAt: Date },
): Promise<CashFlowSummary> {
  const transactions = await prisma.transaction.findMany({
    where: {
      companyId,
      status: { not: 'CANCELED' },
      createdAt: { gte: range.startAt, lte: range.endAt },
    },
    select: { type: true, status: true, amount: true },
  });

  let income = 0;
  let expense = 0;
  let pendingReceivables = 0;
  let pendingPayables = 0;

  for (const t of transactions) {
    const amount = Number(t.amount);
    if (t.status === 'PAID') {
      if (t.type === 'INCOME') income += amount;
      else expense += amount;
    } else if (t.status === 'PENDING') {
      if (t.type === 'INCOME') pendingReceivables += amount;
      else pendingPayables += amount;
    }
  }

  return { income, expense, balance: income - expense, pendingReceivables, pendingPayables };
}

/**
 * Auto-generates the income Transaction for a completed appointment (service
 * revenue only — product sales get their own transactions, see
 * src/server/data/stock.ts). Idempotent: checks for an existing
 * appointment-linked "service" transaction first, since an appointment can
 * be marked DONE more than once across status changes (e.g. DONE -> back to
 * CONFIRMED by mistake -> DONE again) and this must never double-book revenue.
 */
export async function createIncomeFromAppointment(
  companyId: string,
  appointment: Appointment,
  createdByUserId: string,
): Promise<void> {
  const existing = await prisma.transaction.findFirst({
    where: { companyId, appointmentId: appointment.id, category: 'Atendimento' },
    select: { id: true },
  });
  if (existing) return;

  await prisma.transaction.create({
    data: {
      companyId,
      appointmentId: appointment.id,
      type: 'INCOME',
      status: 'PAID',
      description: appointment.serviceNameSnapshot,
      category: 'Atendimento',
      amount: appointment.priceSnapshot,
      paidAt: appointment.updatedAt,
      createdByUserId,
    },
  });
}
