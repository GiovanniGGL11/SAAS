import { restoreSuppliesForAppointment } from '@/server/data/service-supplies';
import { Prisma as PrismaNamespace, type Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import type {
  Appointment,
  PaymentMethod,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Taxa da maquininha e dia em que o dinheiro cai, para uma entrada paga. Calculado no momento do
 * pagamento com a taxa configurada naquele dia — mudar a taxa depois não reescreve o passado.
 */
export async function feeFields(
  db: Db,
  companyId: string,
  t: {
    type: TransactionType;
    status: TransactionStatus;
    amount: Prisma.Decimal | number;
    paymentMethod?: PaymentMethod | null;
    paidAt?: Date | null;
  },
): Promise<{ feeAmount: Prisma.Decimal; settlesAt: Date | null }> {
  const none = { feeAmount: new PrismaNamespace.Decimal(0), settlesAt: null };
  if (t.type !== 'INCOME' || t.status !== 'PAID' || !t.paymentMethod || !t.paidAt) return none;
  const config = await db.paymentMethodFee.findUnique({
    where: { companyId_paymentMethod: { companyId, paymentMethod: t.paymentMethod } },
  });
  if (!config) return { ...none, settlesAt: t.paidAt };
  return {
    feeAmount: new PrismaNamespace.Decimal(t.amount)
      .mul(config.feePercent)
      .div(100)
      .toDecimalPlaces(2),
    settlesAt: new Date(t.paidAt.getTime() + config.settlementDays * 86_400_000),
  };
}

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
      ...(await feeFields(prisma, companyId, data)),
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
      ...(await feeFields(prisma, companyId, { ...data, paidAt })),
    },
  });
  if (result.count === 0) throw new UserError('Lançamento não encontrado.');

  return (await prisma.transaction.findFirst({ where: { id, companyId } }))!;
}

export async function markTransactionPaid(companyId: string, id: string): Promise<void> {
  const current = await prisma.transaction.findFirst({ where: { id, companyId } });
  if (!current) throw new UserError('Lançamento não encontrado.');
  const paidAt = new Date();
  await prisma.transaction.updateMany({
    where: { id, companyId },
    data: {
      status: 'PAID',
      paidAt,
      ...(await feeFields(prisma, companyId, { ...current, status: 'PAID', paidAt })),
    },
  });
}

export async function cancelTransaction(companyId: string, id: string): Promise<void> {
  const result = await prisma.transaction.updateMany({
    where: { id, companyId },
    data: { status: 'CANCELED' },
  });
  if (result.count === 0) throw new UserError('Lançamento não encontrado.');
}

export type CashFlowSummary = {
  /** Entradas pagas, valor bruto (o que o cliente pagou). */
  income: number;
  /** Taxas de cartão/maquininha descontadas das entradas. */
  fees: number;
  expense: number;
  /** Entradas líquidas − saídas. */
  balance: number;
  pendingReceivables: number;
  pendingPayables: number;
  /** Já pago pelo cliente, mas ainda não caiu na conta (cartão de crédito, por exemplo). */
  toSettle: number;
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
    select: { type: true, status: true, amount: true, feeAmount: true, settlesAt: true },
  });

  let income = 0;
  let fees = 0;
  let expense = 0;
  let pendingReceivables = 0;
  let pendingPayables = 0;
  let toSettle = 0;
  const now = Date.now();

  for (const t of transactions) {
    const amount = Number(t.amount);
    if (t.status === 'PAID') {
      if (t.type === 'INCOME') {
        income += amount;
        fees += Number(t.feeAmount);
        if (t.settlesAt && t.settlesAt.getTime() > now) toSettle += amount - Number(t.feeAmount);
      } else expense += amount;
    } else if (t.status === 'PENDING') {
      if (t.type === 'INCOME') pendingReceivables += amount;
      else pendingPayables += amount;
    }
  }

  const cents = (n: number) => Math.round(n * 100) / 100;
  return {
    income: cents(income),
    fees: cents(fees),
    expense: cents(expense),
    balance: cents(income - fees - expense),
    pendingReceivables: cents(pendingReceivables),
    pendingPayables: cents(pendingPayables),
    toSettle: cents(toSettle),
  };
}

/**
 * Auto-generates the income Transaction for a completed appointment (service
 * revenue only — product sales get their own transactions, see
 * src/server/data/stock.ts). Idempotent: checks for an existing
 * appointment-linked "service" transaction first, since an appointment can
 * be marked DONE more than once across status changes (e.g. DONE -> back to
 * CONFIRMED by mistake -> DONE again) and this must never double-book revenue.
 */
/** Uma parte do pagamento (a comanda pode dividir: metade no PIX, metade no cartão). */
export type IncomePayment = {
  amount: Prisma.Decimal | number;
  paymentMethod: PaymentMethod | null;
  /** Fiado: fica pendente, ligado ao cliente, até ser recebido. */
  pending?: boolean;
};

/** O que a comanda define na cobrança; sem ela, vale o preço do atendimento sem forma de pagamento. */
export type IncomeCheckout = {
  payments?: IncomePayment[];
  notes?: string | null;
};

export async function createIncomeFromAppointment(
  companyId: string,
  appointment: Appointment,
  createdByUserId: string,
  db: Prisma.TransactionClient = prisma,
  checkout: IncomeCheckout = {},
): Promise<void> {
  const existing = await db.transaction.findMany({
    where: { companyId, appointmentId: appointment.id, category: 'Atendimento' },
    select: { id: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
  // Já cobrado (e não desfeito): não lança de novo.
  if (existing.some((t) => t.status !== 'CANCELED')) return;
  // Cobrado de novo depois de desfeito: reaproveita os lançamentos cancelados em vez de criar outros.
  const reusable = existing.map((t) => t.id);

  const payments: IncomePayment[] = checkout.payments?.length
    ? checkout.payments
    : [{ amount: appointment.priceSnapshot, paymentMethod: null }];
  const paidAt = new Date();
  for (const [index, payment] of payments.entries()) {
    const status = payment.pending ? ('PENDING' as const) : ('PAID' as const);
    const data = {
      status,
      amount: payment.amount,
      paymentMethod: payment.pending ? null : payment.paymentMethod,
      clientId: appointment.clientId,
      // O cupom fica anotado na primeira parte — é de lá que o estorno o lê.
      notes:
        index === 0
          ? [checkout.notes, payment.pending ? 'Fiado' : null].filter(Boolean).join(' · ') || null
          : null,
      paidAt: payment.pending ? null : paidAt,
      ...(await feeFields(db, companyId, {
        type: 'INCOME',
        status,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        paidAt: payment.pending ? null : paidAt,
      })),
    };
    const reuseId = reusable[index];
    if (reuseId) {
      await db.transaction.update({ where: { id: reuseId }, data });
    } else {
      await db.transaction.create({
        data: {
          ...data,
          companyId,
          appointmentId: appointment.id,
          type: 'INCOME',
          description: appointment.serviceNameSnapshot,
          category: 'Atendimento',
          createdByUserId,
        },
      });
    }
  }
}

/**
 * Desfaz a receita de um atendimento que deixou de estar concluído (cancelado ou status voltado).
 * Antes ela ficava no caixa como se o serviço tivesse sido feito e pago.
 */
export async function reverseIncomeFromAppointment(
  companyId: string,
  appointmentId: string,
  db: Prisma.TransactionClient = prisma,
  userId = 'system',
): Promise<void> {
  // Cupom usado na cobrança volta a ficar disponível (o código fica anotado no lançamento).
  const charged = await db.transaction.findMany({
    where: { companyId, appointmentId, category: 'Atendimento', status: { not: 'CANCELED' } },
    select: { notes: true },
  });
  const couponCode = charged.map((t) => t.notes?.match(/cupom:(\S+)/)?.[1]).find(Boolean);
  if (couponCode) {
    await db.coupon.updateMany({
      where: { companyId, code: couponCode, usedCount: { gt: 0 } },
      data: { usedCount: { decrement: 1 } },
    });
  }
  // Sessão de pacote e saldo de vale-presente usados nesta comanda voltam para o cliente.
  const credits = await db.appointmentCredit.findMany({ where: { appointmentId } });
  for (const credit of credits) {
    if (credit.clientPackageId) {
      const restored = await db.clientPackage.updateMany({
        where: { id: credit.clientPackageId, sessionsUsed: { gt: 0 } },
        data: { sessionsUsed: { decrement: 1 } },
      });
      // No livro do pacote, o estorno fica registrado (a sessão consumida não some do histórico).
      if (restored.count > 0) {
        await db.packageMovement.create({
          data: {
            companyId,
            clientPackageId: credit.clientPackageId,
            kind: 'RESTORE',
            quantity: -1,
            appointmentId,
            reason: 'Atendimento deixou de estar concluído',
            createdByUserId: userId,
          },
        });
      }
    }
    if (credit.giftCardId) {
      await db.giftCard.updateMany({
        where: { id: credit.giftCardId },
        data: { balance: { increment: credit.amount } },
      });
    }
  }
  if (credits.length) await db.appointmentCredit.deleteMany({ where: { appointmentId } });

  // Material que o serviço baixou do estoque volta (a conclusão foi desfeita ou cancelada).
  await restoreSuppliesForAppointment(db as Prisma.TransactionClient, {
    companyId,
    appointmentId,
    userId,
  });

  // Serviço e gorjeta saem juntos; produto vendido continua (a mercadoria saiu).
  await db.transaction.updateMany({
    where: {
      companyId,
      appointmentId,
      category: { in: ['Atendimento', 'Gorjeta'] },
      status: { not: 'CANCELED' },
    },
    data: { status: 'CANCELED' },
  });
}

/**
 * Vendido × a receber × recebido — números separados de propósito:
 * - vendido: entradas lançadas no período (pagas ou pendentes);
 * - recebido: entradas pagas no período (pela data do pagamento);
 * - a receber: tudo o que está pendente hoje (e quanto já venceu).
 */
export async function getSoldDueReceived(companyId: string, range: { startAt: Date; endAt: Date }) {
  const inRange = { gte: range.startAt, lt: range.endAt };
  const now = new Date();
  const [sold, received, receivedNoDate, due, overdue] = await Promise.all([
    prisma.transaction.aggregate({
      where: { companyId, type: 'INCOME', status: { not: 'CANCELED' }, createdAt: inRange },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { companyId, type: 'INCOME', status: 'PAID', paidAt: inRange },
      _sum: { amount: true },
    }),
    // Lançamentos pagos antigos sem data de pagamento contam pela data do lançamento.
    prisma.transaction.aggregate({
      where: { companyId, type: 'INCOME', status: 'PAID', paidAt: null, createdAt: inRange },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { companyId, type: 'INCOME', status: 'PENDING' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { companyId, type: 'INCOME', status: 'PENDING', dueDate: { lt: now } },
      _sum: { amount: true },
    }),
  ]);
  const n = (v: { _sum: { amount: unknown } }) => Number(v._sum.amount ?? 0);
  return {
    sold: n(sold),
    received: Math.round((n(received) + n(receivedNoDate)) * 100) / 100,
    due: n(due),
    dueCount: due._count,
    overdue: n(overdue),
  };
}
