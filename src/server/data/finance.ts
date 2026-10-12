import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import type {
  Appointment,
  PaymentMethod,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

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
  filters?: {
    type?: TransactionType;
    status?: TransactionStatus;
    range?: { startAt: Date; endAt: Date };
  },
): Promise<TransactionWithAppointment[]> {
  return prisma.transaction.findMany({
    where: {
      companyId,
      ...(filters?.type ? { type: filters.type } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      // O período é o do dinheiro: pago quando foi pago, pendente pelo vencimento — não a data em
      // que o lançamento foi digitado.
      ...(filters?.range ? effectiveDateFilter(filters.range) : {}),
    },
    include: { appointment: { select: { id: true, clientId: true } } },
    orderBy: [
      { paidAt: { sort: 'desc', nulls: 'last' } },
      { dueDate: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 500,
  });
}

function effectiveDateFilter(range: { startAt: Date; endAt: Date }): Prisma.TransactionWhereInput {
  const within = { gte: range.startAt, lte: range.endAt };
  return {
    OR: [
      { paidAt: within },
      { paidAt: null, dueDate: within },
      { paidAt: null, dueDate: null, createdAt: within },
    ],
  };
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
  const current = await prisma.transaction.findFirst({ where: { id, companyId } });
  if (!current) throw new UserError('Lançamento não encontrado.');
  // Lançado pelo próprio atendimento: valor e categoria vêm dele, e mudá-los aqui deixaria o caixa
  // diferente do que a agenda mostra (e reabria o lançamento em dobro ao concluir de novo).
  if (
    current.appointmentId &&
    (Number(current.amount) !== data.amount ||
      (current.category ?? null) !== (data.category || null))
  ) {
    throw new UserError(
      'Este lançamento veio de um atendimento: valor e categoria mudam pelo atendimento.',
    );
  }
  // Editar a descrição de um lançamento pago não pode mudar a data em que ele foi pago.
  const paidAt = data.status === 'PAID' ? (current.paidAt ?? data.paidAt ?? new Date()) : null;
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
      paidAt,
      notes: data.notes || null,
    },
  });
  if (result.count === 0) throw new UserError('Lançamento não encontrado.');

  return (await prisma.transaction.findFirst({ where: { id, companyId } }))!;
}

export async function markTransactionPaid(companyId: string, id: string): Promise<void> {
  const result = await prisma.transaction.updateMany({
    where: { id, companyId },
    data: { status: 'PAID', paidAt: new Date() },
  });
  if (result.count === 0) throw new UserError('Lançamento não encontrado.');
}

export async function cancelTransaction(companyId: string, id: string): Promise<void> {
  const result = await prisma.transaction.updateMany({
    where: { id, companyId },
    data: { status: 'CANCELED' },
  });
  if (result.count === 0) throw new UserError('Lançamento não encontrado.');
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
      ...effectiveDateFilter(range),
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
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  const existing = await db.transaction.findFirst({
    where: { companyId, appointmentId: appointment.id, category: 'Atendimento' },
    select: { id: true, status: true },
  });
  if (existing) {
    // Concluído de novo depois de desfeito: reativa o lançamento em vez de criar outro.
    if (existing.status === 'CANCELED') {
      await db.transaction.update({
        where: { id: existing.id },
        data: { status: 'PAID', paidAt: new Date(), amount: appointment.priceSnapshot },
      });
    }
    return;
  }

  await db.transaction.create({
    data: {
      companyId,
      appointmentId: appointment.id,
      type: 'INCOME',
      status: 'PAID',
      description: appointment.serviceNameSnapshot,
      category: 'Atendimento',
      amount: appointment.priceSnapshot,
      paidAt: new Date(),
      createdByUserId,
    },
  });
}

/**
 * Desfaz a receita de um atendimento que deixou de estar concluído (cancelado ou status voltado).
 * Antes ela ficava no caixa como se o serviço tivesse sido feito e pago.
 */
export async function reverseIncomeFromAppointment(
  companyId: string,
  appointmentId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<void> {
  await db.transaction.updateMany({
    where: { companyId, appointmentId, category: 'Atendimento', status: { not: 'CANCELED' } },
    data: { status: 'CANCELED' },
  });
}
