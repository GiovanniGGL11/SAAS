import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { CashMovementKind, PaymentMethod } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

/**
 * Caixa do dia. Abre com o troco da gaveta; durante o turno, entradas e saídas em dinheiro do
 * financeiro (comanda, venda, despesa paga) e sangrias/suprimentos mexem no valor esperado; ao
 * fechar, compara o esperado com o contado. As outras formas de pagamento aparecem para conferir
 * com a maquininha e o extrato.
 */

export type MethodTotal = { paymentMethod: PaymentMethod | null; income: number; expense: number };

export type CashSessionSummary = {
  id: string;
  openedAt: Date;
  openedByUserId: string;
  openingAmount: number;
  closedAt: Date | null;
  closedByUserId: string | null;
  countedCash: number | null;
  notes: string | null;
  movements: {
    id: string;
    kind: CashMovementKind;
    amount: number;
    reason: string | null;
    createdAt: Date;
  }[];
  byMethod: MethodTotal[];
  cashIncome: number;
  cashExpense: number;
  deposits: number;
  withdrawals: number;
  expectedCash: number;
};

type Db = Prisma.TransactionClient | typeof prisma;

const cents = (n: number) => Math.round(n * 100) / 100;

async function summarize(
  db: Db,
  session: Prisma.CashSessionGetPayload<{ include: { movements: true } }>,
): Promise<CashSessionSummary> {
  const transactions = await db.transaction.findMany({
    where: {
      companyId: session.companyId,
      status: 'PAID',
      paidAt: { gte: session.openedAt, ...(session.closedAt ? { lte: session.closedAt } : {}) },
    },
    select: { type: true, amount: true, paymentMethod: true },
  });
  const byMethod = new Map<PaymentMethod | null, MethodTotal>();
  for (const t of transactions) {
    const row = byMethod.get(t.paymentMethod) ?? {
      paymentMethod: t.paymentMethod,
      income: 0,
      expense: 0,
    };
    if (t.type === 'INCOME') row.income += Number(t.amount);
    else row.expense += Number(t.amount);
    byMethod.set(t.paymentMethod, row);
  }
  const cash = byMethod.get('CASH');
  const cashIncome = cents(cash?.income ?? 0);
  const cashExpense = cents(cash?.expense ?? 0);
  const deposits = cents(
    session.movements.filter((m) => m.kind === 'DEPOSIT').reduce((s, m) => s + Number(m.amount), 0),
  );
  const withdrawals = cents(
    session.movements
      .filter((m) => m.kind === 'WITHDRAWAL')
      .reduce((s, m) => s + Number(m.amount), 0),
  );
  const opening = Number(session.openingAmount);

  return {
    id: session.id,
    openedAt: session.openedAt,
    openedByUserId: session.openedByUserId,
    openingAmount: opening,
    closedAt: session.closedAt,
    closedByUserId: session.closedByUserId,
    countedCash: session.countedCash === null ? null : Number(session.countedCash),
    notes: session.notes,
    movements: session.movements
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => ({
        id: m.id,
        kind: m.kind,
        amount: Number(m.amount),
        reason: m.reason,
        createdAt: m.createdAt,
      })),
    byMethod: [...byMethod.values()].map((r) => ({
      ...r,
      income: cents(r.income),
      expense: cents(r.expense),
    })),
    cashIncome,
    cashExpense,
    deposits,
    withdrawals,
    // Fechado: vale o esperado gravado no fechamento (o que o operador viu).
    expectedCash:
      session.closedAt && session.expectedCash !== null
        ? Number(session.expectedCash)
        : cents(opening + cashIncome - cashExpense + deposits - withdrawals),
  };
}

export async function getCashRegister(companyId: string): Promise<{
  current: CashSessionSummary | null;
  recent: CashSessionSummary[];
}> {
  const [open, closed] = await Promise.all([
    prisma.cashSession.findFirst({
      where: { companyId, closedAt: null },
      include: { movements: true },
    }),
    prisma.cashSession.findMany({
      where: { companyId, closedAt: { not: null } },
      include: { movements: true },
      orderBy: { closedAt: 'desc' },
      take: 10,
    }),
  ]);
  return {
    current: open ? await summarize(prisma, open) : null,
    recent: await Promise.all(closed.map((s) => summarize(prisma, s))),
  };
}

export async function openCashSession(companyId: string, userId: string, openingAmount: number) {
  const existing = await prisma.cashSession.findFirst({
    where: { companyId, closedAt: null },
    select: { id: true },
  });
  if (existing) throw new UserError('Já existe um caixa aberto.');
  try {
    await prisma.cashSession.create({
      data: { companyId, openedByUserId: userId, openingAmount },
    });
  } catch (error) {
    // Dois cliques ao mesmo tempo: o índice parcial deixa só um passar.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new UserError('Já existe um caixa aberto.');
    }
    throw error;
  }
}

async function requireOpenSession(db: Db, companyId: string, sessionId: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "CashSession"
    WHERE "id" = ${sessionId} AND "companyId" = ${companyId} AND "closedAt" IS NULL
    FOR UPDATE`;
  if (rows.length === 0) throw new UserError('Este caixa já foi fechado.');
}

export async function addCashMovement(params: {
  companyId: string;
  sessionId: string;
  kind: CashMovementKind;
  amount: number;
  reason?: string | null;
  userId: string;
}) {
  await prisma.$transaction(async (tx) => {
    await requireOpenSession(tx, params.companyId, params.sessionId);
    await tx.cashMovement.create({
      data: {
        sessionId: params.sessionId,
        kind: params.kind,
        amount: params.amount,
        reason: params.reason?.trim() || null,
        createdByUserId: params.userId,
      },
    });
  });
}

export async function closeCashSession(params: {
  companyId: string;
  sessionId: string;
  countedCash: number;
  notes?: string | null;
  userId: string;
}): Promise<CashSessionSummary> {
  return prisma.$transaction(async (tx) => {
    await requireOpenSession(tx, params.companyId, params.sessionId);
    const closedAt = new Date();
    const session = (await tx.cashSession.findUnique({
      where: { id: params.sessionId },
      include: { movements: true },
    }))!;
    // O esperado é calculado até o instante do fechamento e gravado junto.
    const summary = await summarize(tx, { ...session, closedAt, expectedCash: null });
    const updated = await tx.cashSession.update({
      where: { id: params.sessionId },
      data: {
        closedAt,
        closedByUserId: params.userId,
        expectedCash: summary.expectedCash,
        countedCash: params.countedCash,
        notes: params.notes?.trim() || null,
      },
      include: { movements: true },
    });
    return summarize(tx, updated);
  });
}
