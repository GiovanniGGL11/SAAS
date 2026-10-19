import { prisma } from '@/lib/db';
import { csvSafe } from '@/lib/import';
import { monthLabel, monthRange, shiftMonth, type MonthKey } from '@/lib/month';
import { PAYMENT_METHODS } from '@/lib/validations/finance';

/**
 * DRE simplificado, regime de caixa: conta o que foi pago dentro do mês (pela data do pagamento).
 * Receita bruta − taxas de cartão = receita líquida; − despesas por categoria = resultado.
 */
export type StatementLine = { category: string; values: number[] };

export type IncomeStatement = {
  months: { key: MonthKey; label: string }[];
  income: StatementLine[];
  grossIncome: number[];
  fees: number[];
  netIncome: number[];
  expenses: StatementLine[];
  totalExpenses: number[];
  result: number[];
  /** Resultado ÷ receita bruta, em %; null sem receita. */
  margin: (number | null)[];
};

const cents = (n: number) => Math.round(n * 100) / 100;

export async function getIncomeStatement(
  companyId: string,
  timezone: string,
  month: MonthKey,
  /** Quantos meses para trás, para comparar (o mês pedido vem primeiro). */
  compare = 2,
): Promise<IncomeStatement> {
  const keys = Array.from({ length: compare + 1 }, (_, i) => shiftMonth(month, -i));
  const ranges = keys.map((k) => monthRange(k, timezone));
  const transactions = await prisma.transaction.findMany({
    where: {
      companyId,
      status: 'PAID',
      paidAt: { gte: ranges[ranges.length - 1].startAt, lt: ranges[0].endAt },
    },
    select: { type: true, category: true, amount: true, feeAmount: true, paidAt: true },
  });

  const zeros = () => keys.map(() => 0);
  const income = new Map<string, number[]>();
  const expenses = new Map<string, number[]>();
  const fees = zeros();

  for (const t of transactions) {
    const index = ranges.findIndex((r) => t.paidAt! >= r.startAt && t.paidAt! < r.endAt);
    if (index < 0) continue;
    const target = t.type === 'INCOME' ? income : expenses;
    const category = t.category || (t.type === 'INCOME' ? 'Outras receitas' : 'Outras despesas');
    const row = target.get(category) ?? zeros();
    row[index] += Number(t.amount);
    target.set(category, row);
    if (t.type === 'INCOME') fees[index] += Number(t.feeAmount);
  }

  const toLines = (map: Map<string, number[]>) =>
    [...map.entries()]
      .map(([category, values]) => ({ category, values: values.map(cents) }))
      .sort((a, b) => b.values[0] - a.values[0] || a.category.localeCompare(b.category, 'pt-BR'));
  const sum = (lines: StatementLine[]) =>
    keys.map((_, i) => cents(lines.reduce((s, l) => s + l.values[i], 0)));

  const incomeLines = toLines(income);
  const expenseLines = toLines(expenses);
  const grossIncome = sum(incomeLines);
  const feeTotals = fees.map(cents);
  const netIncome = grossIncome.map((g, i) => cents(g - feeTotals[i]));
  const totalExpenses = sum(expenseLines);
  const result = netIncome.map((n, i) => cents(n - totalExpenses[i]));

  return {
    months: keys.map((key) => ({ key, label: monthLabel(key) })),
    income: incomeLines,
    grossIncome,
    fees: feeTotals,
    netIncome,
    expenses: expenseLines,
    totalExpenses,
    result,
    margin: result.map((r, i) =>
      grossIncome[i] > 0 ? Math.round((r / grossIncome[i]) * 1000) / 10 : null,
    ),
  };
}

const STATUS: Record<string, string> = { PAID: 'Pago', PENDING: 'Pendente', CANCELED: 'Cancelado' };
const METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<
  string,
  string
>;

/**
 * Planilha do mês para o contador: todos os lançamentos (inclusive pendentes e cancelados, com o
 * status), no formato que o Excel em português abre direto (; e vírgula decimal).
 */
export async function exportMonthCsv(
  companyId: string,
  timezone: string,
  month: MonthKey,
): Promise<string> {
  const { startAt, endAt } = monthRange(month, timezone);
  const within = { gte: startAt, lt: endAt };
  const transactions = await prisma.transaction.findMany({
    where: {
      companyId,
      OR: [
        { paidAt: within },
        { paidAt: null, dueDate: within },
        { paidAt: null, dueDate: null, createdAt: within },
      ],
    },
    orderBy: [{ paidAt: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
  });
  const date = (d: Date | null) =>
    d ? new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(d) : '';
  const money = (n: number) => n.toFixed(2).replace('.', ',');
  // Texto vindo de cadastro pode começar com "=": sai neutralizado (nunca vira fórmula no Excel).
  const cell = (raw: string) => {
    const v = csvSafe(raw);
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const header = [
    'Data',
    'Tipo',
    'Descrição',
    'Categoria',
    'Forma de pagamento',
    'Status',
    'Valor bruto',
    'Taxa',
    'Valor líquido',
    'Vencimento',
    'Pago em',
    'Cai na conta em',
    'Observações',
  ];
  const rows = transactions.map((t) => {
    const amount = Number(t.amount);
    const fee = Number(t.feeAmount);
    return [
      date(t.paidAt ?? t.dueDate ?? t.createdAt),
      t.type === 'INCOME' ? 'Entrada' : 'Saída',
      t.description,
      t.category ?? '',
      t.paymentMethod ? METHOD[t.paymentMethod] : '',
      STATUS[t.status],
      money(t.type === 'INCOME' ? amount : -amount),
      money(fee),
      money(t.type === 'INCOME' ? amount - fee : -amount),
      date(t.dueDate),
      date(t.paidAt),
      date(t.settlesAt),
      t.notes ?? '',
    ].map(cell);
  });
  return '﻿' + [header, ...rows].map((r) => r.join(';')).join('\r\n') + '\r\n';
}
