import { prisma } from '@/lib/db';
import { monthRange, type MonthKey } from '@/lib/month';
import { getPricingProfile } from '@/server/data/pricing';

/*
  DRE gerencial (plano Pro) — o lucro de verdade do mês, em dois regimes:

  COMPETÊNCIA (o que foi feito no mês): atendimento conta no dia em que aconteceu (concluído);
  outras vendas e despesas pelo vencimento (ou pagamento, ou lançamento). Pagas e a receber/pagar.
  O custo é o dos materiais consumidos e dos produtos vendidos (CMV/CSP, pelo custo gravado no
  movimento do estoque); a compra de mercadoria NÃO entra (ela vira estoque). Comissão é a
  calculada sobre os atendimentos do mês.

  CAIXA (o que entrou e saiu no mês): só o que foi pago, pela data do pagamento. O custo é o que
  foi pago em compras de mercadoria/insumos; comissão é o que foi pago à equipe.

  Pacotes, assinaturas e vales: a receita entra uma vez, na venda. A sessão usada depois cobra
  zero (ou só a diferença) e aparece à parte como "sessões já pagas" — nunca soma de novo.
  Impostos: com alíquota cadastrada na calculadora de preço, são estimados sobre a receita (e o
  lançamento "Impostos" sai das despesas para não contar duas vezes); sem alíquota, vale o que foi
  lançado em "Impostos".
*/

export type Basis = 'accrual' | 'cash';

type DrillItem = {
  date: Date;
  description: string;
  detail: string | null;
  amount: number;
  status?: string;
  estimated?: boolean;
};

export type StatementRow = {
  key: string;
  label: string;
  value: number;
  /** revenue/deduction/cost/expense somam; subtotal/result são totais. */
  kind: 'revenue' | 'deduction' | 'subtotal' | 'cost' | 'expense' | 'result';
  estimated?: boolean;
  note?: string;
  /** Tem lançamentos para abrir (drill-down). */
  drill: boolean;
};

const cents = (n: number) => Math.round(n * 100) / 100;
const ACTIVE_APPT = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as const;
/** Despesas que o DRE trata em linhas próprias (para não contar duas vezes). */
const PURCHASES = new Set(['Produtos e insumos', 'Produtos']);
const COMMISSIONS = 'Comissões';
const TAXES = 'Impostos';

/** Data de competência de um lançamento sem atendimento. */
function competence(t: { dueDate: Date | null; paidAt: Date | null; createdAt: Date }) {
  return t.dueDate ?? t.paidAt ?? t.createdAt;
}

async function loadMonth(companyId: string, timezone: string, month: MonthKey, basis: Basis) {
  const { startAt, endAt } = monthRange(month, timezone);
  const within = { gte: startAt, lt: endAt };
  const inRange = (d: Date) => d >= startAt && d < endAt;

  const txSelect = {
    id: true,
    type: true,
    status: true,
    category: true,
    description: true,
    amount: true,
    feeAmount: true,
    dueDate: true,
    paidAt: true,
    createdAt: true,
    updatedAt: true,
    appointmentId: true,
    appointment: { select: { startAt: true, status: true } },
  } as const;

  const transactions =
    basis === 'cash'
      ? await prisma.transaction.findMany({
          where: {
            companyId,
            OR: [
              { status: 'PAID', paidAt: within },
              // Recebido e desfeito no mês: estorno.
              { type: 'INCOME', status: 'CANCELED', paidAt: { not: null }, updatedAt: within },
            ],
          },
          select: txSelect,
        })
      : (
          await prisma.transaction.findMany({
            where: {
              companyId,
              OR: [
                { appointment: { startAt: within } },
                { appointmentId: null, dueDate: within },
                { appointmentId: null, dueDate: null, paidAt: within },
                { appointmentId: null, dueDate: null, paidAt: null, createdAt: within },
              ],
            },
            select: txSelect,
          })
        ).filter((t) => (t.appointment ? inRange(t.appointment.startAt) : inRange(competence(t))));

  const doneAppointments = await prisma.appointment.findMany({
    where: { companyId, status: 'DONE', startAt: within },
    select: {
      id: true,
      startAt: true,
      serviceId: true,
      professionalId: true,
      priceSnapshot: true,
      discountAmount: true,
      durationMinutesSnapshot: true,
      bufferMinutes: true,
      serviceNameSnapshot: true,
      client: { select: { name: true } },
      professional: {
        select: { name: true, commissionType: true, commissionValue: true },
      },
      items: { select: { serviceId: true, nameSnapshot: true, priceSnapshot: true } },
      credits: { select: { kind: true, amount: true } },
      transactions: {
        where: {
          category: { in: ['Atendimento', 'Sinal'] },
          status: { not: 'CANCELED' },
        },
        select: { amount: true, feeAmount: true, status: true },
      },
    },
  });

  const movements = await prisma.stockMovement.findMany({
    where: {
      companyId,
      OR: [
        { type: 'SALE', createdAt: within },
        basis === 'accrual'
          ? { appointmentId: { in: doneAppointments.map((a) => a.id) } }
          : { appointmentId: { not: null }, type: { in: ['OUT', 'IN'] }, createdAt: within },
      ],
    },
    select: {
      type: true,
      quantity: true,
      reason: true,
      unitCost: true,
      unitPrice: true,
      appointmentId: true,
      createdAt: true,
      product: { select: { id: true, name: true, unit: true, costPrice: true, salePrice: true } },
    },
  });

  return { startAt, endAt, transactions, doneAppointments, movements };
}

type Loaded = Awaited<ReturnType<typeof loadMonth>>;

/** Custo de um movimento: o gravado nele; movimento antigo (sem custo gravado) usa o custo atual. */
function movementCost(m: Loaded['movements'][number]) {
  const unit = m.unitCost ?? m.product.costPrice;
  return { value: Number(unit) * m.quantity, estimated: m.unitCost === null };
}

function isConsumption(m: Loaded['movements'][number]) {
  return m.appointmentId !== null && (m.type === 'OUT' || m.type === 'IN');
}

/** Materiais consumidos (consumo − estorno) e custo, por atendimento. */
function materialsByAppointment(movements: Loaded['movements']) {
  const map = new Map<string, { value: number; estimated: boolean }>();
  for (const m of movements) {
    if (!isConsumption(m) || !m.appointmentId) continue;
    const c = movementCost(m);
    const row = map.get(m.appointmentId) ?? { value: 0, estimated: false };
    row.value += m.type === 'OUT' ? c.value : -c.value;
    row.estimated ||= c.estimated;
    map.set(m.appointmentId, row);
  }
  return map;
}

/** Comissão de um atendimento — a mesma regra das Comissões (serviço com % própria ou a do profissional). */
function commissionOf(
  a: Loaded['doneAppointments'][number],
  charged: number,
  servicePct: Map<string, number>,
) {
  const parts = a.items.length
    ? a.items.map((i) => ({ serviceId: i.serviceId, price: Number(i.priceSnapshot) }))
    : [{ serviceId: a.serviceId, price: Number(a.priceSnapshot) }];
  const listTotal = parts.reduce((s, p) => s + p.price, 0);
  const pro = a.professional;
  let total = 0;
  for (const part of parts) {
    const share = listTotal > 0 ? (charged * part.price) / listTotal : charged / parts.length;
    const pct =
      servicePct.get(part.serviceId) ??
      (pro.commissionType === 'PERCENTAGE' ? Number(pro.commissionValue ?? 0) : null);
    if (pct !== null) total += (share * pct) / 100;
    else if (pro.commissionType === 'FIXED')
      total += Number(pro.commissionValue ?? 0) / parts.length;
  }
  return total;
}

/** Cobrado pelo serviço: comanda + sinal + sessão de pacote/vale (o cliente pagou antes). */
function chargedOf(a: Loaded['doneAppointments'][number]) {
  return (
    a.transactions.reduce((s, t) => s + Number(t.amount), 0) +
    a.credits.reduce((s, c) => s + Number(c.amount), 0)
  );
}

async function servicePercents(companyId: string, appointments: Loaded['doneAppointments']) {
  const ids = new Set<string>();
  for (const a of appointments) {
    ids.add(a.serviceId);
    for (const i of a.items) ids.add(i.serviceId);
  }
  const rows = await prisma.service.findMany({
    where: { companyId, id: { in: [...ids] }, commissionPercent: { not: null } },
    select: { id: true, commissionPercent: true },
  });
  return new Map(rows.map((r) => [r.id, r.commissionPercent!]));
}

type Built = {
  rows: StatementRow[];
  drill: Map<string, DrillItem[]>;
  info: {
    packageSessions: { count: number; value: number };
    pendingCosts: number;
    pendingRevenue: number;
    estimatedItems: number;
    discountsWithoutRecord: number;
    taxRateUsed: number | null;
  };
  totals: {
    grossRevenue: number;
    netRevenue: number;
    variableCosts: number;
    fixedExpenses: number;
    netProfit: number;
    doneCount: number;
    serviceRevenue: number;
  };
};

async function buildStatement(
  companyId: string,
  timezone: string,
  month: MonthKey,
  basis: Basis,
): Promise<Built> {
  const [data, profile] = await Promise.all([
    loadMonth(companyId, timezone, month, basis),
    getPricingProfile(companyId),
  ]);
  const drill = new Map<string, DrillItem[]>();
  const push = (key: string, item: DrillItem) => {
    const list = drill.get(key) ?? [];
    list.push(item);
    drill.set(key, list);
  };
  let estimatedItems = 0;

  // Receitas por categoria (válidas) e estornos.
  const revenueByCat = new Map<string, number>();
  let refunds = 0;
  let fees = 0;
  let pendingRevenue = 0;
  const expenseByCat = new Map<string, number>();
  let pendingCosts = 0;
  for (const t of data.transactions) {
    const amount = Number(t.amount);
    const date = t.appointment?.startAt ?? (basis === 'cash' ? t.paidAt! : competence(t));
    const category = t.category || (t.type === 'INCOME' ? 'Outras receitas' : 'Outras despesas');
    if (t.type === 'INCOME') {
      if (t.status === 'CANCELED') {
        // Recebido e desfeito: no caixa, só quando foi pago; na competência, idem.
        if (!t.paidAt) continue;
        refunds += amount;
        revenueByCat.set(category, (revenueByCat.get(category) ?? 0) + amount);
        push('refunds', {
          date: t.updatedAt,
          description: t.description,
          detail: category,
          amount,
        });
        push(`rev:${category}`, {
          date,
          description: t.description,
          detail: 'estornado',
          amount,
          status: 'CANCELED',
        });
        continue;
      }
      revenueByCat.set(category, (revenueByCat.get(category) ?? 0) + amount);
      if (t.status === 'PENDING') pendingRevenue += amount;
      push(`rev:${category}`, {
        date,
        description: t.description,
        detail: null,
        amount,
        status: t.status,
      });
      if (t.status === 'PAID' && Number(t.feeAmount) > 0) {
        fees += Number(t.feeAmount);
        push('fees', {
          date: t.paidAt ?? date,
          description: t.description,
          detail: category,
          amount: Number(t.feeAmount),
        });
      }
    } else {
      if (t.status === 'CANCELED') continue;
      expenseByCat.set(category, (expenseByCat.get(category) ?? 0) + amount);
      if (t.status === 'PENDING') pendingCosts += amount;
      push(`exp:${category}`, {
        date: basis === 'cash' ? t.paidAt! : competence(t),
        description: t.description,
        detail: null,
        amount,
        status: t.status,
      });
    }
  }

  // Descontos dos atendimentos concluídos (gravados na comanda).
  let discounts = 0;
  let discountsWithoutRecord = 0;
  const packageSessions = { count: 0, value: 0 };
  for (const a of data.doneAppointments) {
    if (a.discountAmount === null) discountsWithoutRecord += 1;
    const d = Number(a.discountAmount ?? 0);
    if (d > 0) {
      discounts += d;
      push('discounts', {
        date: a.startAt,
        description: a.serviceNameSnapshot,
        detail: a.client.name,
        amount: d,
      });
    }
    for (const c of a.credits) {
      packageSessions.count += 1;
      packageSessions.value += Number(c.amount);
      push('package-sessions', {
        date: a.startAt,
        description: a.serviceNameSnapshot,
        detail: `${a.client.name} · ${c.kind === 'PACKAGE' ? 'sessão de pacote' : 'vale-presente'}`,
        amount: Number(c.amount),
      });
    }
  }

  const recognized = [...revenueByCat.values()].reduce((s, v) => s + v, 0);
  const grossRevenue = recognized + discounts;
  const afterDiscounts = grossRevenue - discounts - refunds;

  // Impostos: estimados pela alíquota (quando cadastrada) ou o lançado em "Impostos".
  const taxRate = profile.taxPercent > 0 ? profile.taxPercent / 100 : null;
  const taxes = taxRate !== null ? afterDiscounts * taxRate : (expenseByCat.get(TAXES) ?? 0);
  if (taxRate === null) drill.set('taxes', drill.get(`exp:${TAXES}`) ?? []);
  expenseByCat.delete(TAXES);

  const netRevenue = afterDiscounts - taxes - fees;

  // Custos variáveis.
  let cmv = 0;
  let csp = 0;
  let cmvEstimated = false;
  let cspEstimated = false;
  let commissions = 0;
  const servicePct = await servicePercents(companyId, data.doneAppointments);
  if (basis === 'accrual') {
    for (const m of data.movements) {
      const c = movementCost(m);
      if (c.estimated) estimatedItems += 1;
      if (m.type === 'SALE') {
        cmv += c.value;
        cmvEstimated ||= c.estimated;
        push('cmv', {
          date: m.createdAt,
          description: `${m.product.name} × ${m.quantity}`,
          detail: m.reason,
          amount: c.value,
          estimated: c.estimated,
        });
      } else if (isConsumption(m)) {
        const signed = m.type === 'OUT' ? c.value : -c.value;
        csp += signed;
        cspEstimated ||= c.estimated;
        push('csp', {
          date: m.createdAt,
          description: `${m.product.name} × ${m.quantity}`,
          detail: m.type === 'OUT' ? 'consumo no atendimento' : 'estorno do consumo',
          amount: signed,
          estimated: c.estimated,
        });
      }
    }
    for (const a of data.doneAppointments) {
      const value = commissionOf(a, chargedOf(a), servicePct);
      if (value <= 0) continue;
      commissions += value;
      push('commissions', {
        date: a.startAt,
        description: a.serviceNameSnapshot,
        detail: a.professional.name,
        amount: cents(value),
      });
    }
    // Comissão já paga e compra de mercadoria não entram de novo (a compra vira estoque).
    expenseByCat.delete(COMMISSIONS);
    for (const c of PURCHASES) expenseByCat.delete(c);
  } else {
    for (const c of PURCHASES) {
      cmv += expenseByCat.get(c) ?? 0;
      for (const item of drill.get(`exp:${c}`) ?? []) push('cmv', item);
      expenseByCat.delete(c);
    }
    commissions = expenseByCat.get(COMMISSIONS) ?? 0;
    drill.set('commissions', drill.get(`exp:${COMMISSIONS}`) ?? []);
    expenseByCat.delete(COMMISSIONS);
  }

  const variableCosts = cmv + csp + commissions;
  const grossProfit = netRevenue - variableCosts;
  const fixedExpenses = [...expenseByCat.values()].reduce((s, v) => s + v, 0);
  const netProfit = grossProfit - fixedExpenses;

  const rows: StatementRow[] = [
    {
      key: 'gross',
      label: 'Receita bruta',
      value: cents(grossRevenue),
      kind: 'subtotal',
      drill: false,
      note:
        basis === 'accrual'
          ? 'Vendido no mês (pago e a receber), antes dos descontos'
          : 'Recebido no mês, antes dos descontos',
    },
    ...[...revenueByCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, value]) => ({
        key: `rev:${category}`,
        label: category,
        value: cents(value),
        kind: 'revenue' as const,
        drill: true,
      })),
    {
      key: 'discounts',
      label: '(−) Descontos e cupons',
      value: cents(-discounts),
      kind: 'deduction',
      drill: discounts > 0,
    },
    {
      key: 'refunds',
      label: '(−) Estornos',
      value: cents(-refunds),
      kind: 'deduction',
      drill: refunds > 0,
      note: 'Recebido e depois desfeito',
    },
    {
      key: 'taxes',
      label: '(−) Impostos sobre a venda',
      value: cents(-taxes),
      kind: 'deduction',
      estimated: taxRate !== null,
      drill: taxRate === null && taxes > 0,
      note:
        taxRate !== null
          ? `Estimado: ${profile.taxPercent}% (alíquota da calculadora de preço)`
          : 'Lançado em "Impostos"',
    },
    {
      key: 'fees',
      label: '(−) Taxas de cartão e PIX',
      value: cents(-fees),
      kind: 'deduction',
      drill: fees > 0,
    },
    {
      key: 'net',
      label: 'Receita líquida',
      value: cents(netRevenue),
      kind: 'subtotal',
      drill: false,
    },
    {
      key: 'cmv',
      label:
        basis === 'accrual'
          ? '(−) Custo dos produtos vendidos (CMV)'
          : '(−) Compras de mercadoria e insumos',
      value: cents(-cmv),
      kind: 'cost',
      estimated: cmvEstimated,
      drill: cmv !== 0,
      note: basis === 'accrual' ? 'Pelo custo gravado na venda' : 'Pago no mês',
    },
    ...(basis === 'accrual'
      ? [
          {
            key: 'csp',
            label: '(−) Materiais dos serviços (CSP)',
            value: cents(-csp),
            kind: 'cost' as const,
            estimated: cspEstimated,
            drill: csp !== 0,
            note: 'Consumo da ficha de cada serviço, pelo custo do dia',
          },
        ]
      : []),
    {
      key: 'commissions',
      label: '(−) Comissões',
      value: cents(-commissions),
      kind: 'cost',
      drill: commissions > 0,
      note: basis === 'accrual' ? 'Calculadas sobre os atendimentos do mês' : 'Pagas no mês',
    },
    {
      key: 'grossProfit',
      label: 'Lucro bruto',
      value: cents(grossProfit),
      kind: 'subtotal',
      drill: false,
    },
    ...[...expenseByCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, value]) => ({
        key: `exp:${category}`,
        label: `(−) ${category}`,
        value: cents(-value),
        kind: 'expense' as const,
        drill: true,
      })),
    {
      key: 'result',
      label: 'Lucro líquido',
      value: cents(netProfit),
      kind: 'result',
      drill: false,
    },
  ];

  return {
    rows,
    drill,
    info: {
      packageSessions: { count: packageSessions.count, value: cents(packageSessions.value) },
      pendingCosts: cents(pendingCosts),
      pendingRevenue: cents(pendingRevenue),
      estimatedItems,
      discountsWithoutRecord,
      taxRateUsed: taxRate !== null ? profile.taxPercent : null,
    },
    totals: {
      grossRevenue: cents(grossRevenue),
      netRevenue: cents(netRevenue),
      variableCosts: cents(variableCosts),
      fixedExpenses: cents(fixedExpenses),
      netProfit: cents(netProfit),
      doneCount: data.doneAppointments.length,
      serviceRevenue: cents(data.doneAppointments.reduce((s, a) => s + chargedOf(a), 0)),
    },
  };
}

/**
 * Ponto de equilíbrio: quanto faturar para pagar as despesas fixas.
 * Margem de contribuição = (receita líquida − custos variáveis) ÷ receita bruta.
 */
export function breakEven(totals: Built['totals']) {
  const contributionPct =
    totals.grossRevenue > 0
      ? (totals.netRevenue - totals.variableCosts) / totals.grossRevenue
      : null;
  const revenueNeeded =
    contributionPct !== null && contributionPct > 0 ? totals.fixedExpenses / contributionPct : null;
  const averageTicket = totals.doneCount > 0 ? totals.serviceRevenue / totals.doneCount : null;
  return {
    fixedExpenses: totals.fixedExpenses,
    contributionPercent: contributionPct === null ? null : Math.round(contributionPct * 1000) / 10,
    revenueNeeded: revenueNeeded === null ? null : cents(revenueNeeded),
    averageTicket: averageTicket === null ? null : cents(averageTicket),
    appointmentsNeeded:
      revenueNeeded !== null && averageTicket ? Math.ceil(revenueNeeded / averageTicket) : null,
    reached: revenueNeeded !== null ? totals.grossRevenue >= revenueNeeded : null,
  };
}

export async function getManagerialStatement(
  companyId: string,
  timezone: string,
  month: MonthKey,
  basis: Basis,
) {
  const built = await buildStatement(companyId, timezone, month, basis);
  return {
    month,
    basis,
    rows: built.rows,
    info: built.info,
    totals: built.totals,
    breakEven: breakEven(built.totals),
  };
}

/** Lançamentos por trás de uma linha do DRE. */
export async function getStatementDrill(
  companyId: string,
  timezone: string,
  month: MonthKey,
  basis: Basis,
  key: string,
) {
  const built = await buildStatement(companyId, timezone, month, basis);
  const items = (built.drill.get(key) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    total: cents(items.reduce((s, i) => s + i.amount, 0)),
    items: items.slice(0, 300).map((i) => ({ ...i, amount: cents(i.amount) })),
    truncated: items.length > 300,
  };
}

/** Previsto × realizado do mês (competência): receita, atendimentos e despesas. */
export async function getForecastVsActual(companyId: string, timezone: string, month: MonthKey) {
  const { startAt, endAt } = monthRange(month, timezone);
  const within = { gte: startAt, lt: endAt };
  const [scheduled, done, recurring, expenses, built] = await Promise.all([
    prisma.appointment.aggregate({
      where: { companyId, status: { in: [...ACTIVE_APPT] }, startAt: within },
      _sum: { priceSnapshot: true },
      _count: true,
    }),
    prisma.appointment.aggregate({
      where: { companyId, status: 'DONE', startAt: within },
      _sum: { priceSnapshot: true },
      _count: true,
    }),
    prisma.recurringExpense.aggregate({
      where: { companyId, active: true },
      _sum: { amount: true },
    }),
    prisma.transaction.findMany({
      where: {
        companyId,
        type: 'EXPENSE',
        status: { not: 'CANCELED' },
        OR: [{ dueDate: within }, { dueDate: null, paidAt: within }],
      },
      select: { amount: true, status: true, recurringExpenseId: true },
    }),
    buildStatement(companyId, timezone, month, 'accrual'),
  ]);
  const doneValue = Number(done._sum.priceSnapshot ?? 0);
  const scheduledValue = Number(scheduled._sum.priceSnapshot ?? 0);
  const paidExpenses = expenses
    .filter((e) => e.status === 'PAID')
    .reduce((s, e) => s + Number(e.amount), 0);
  const oneOff = expenses
    .filter((e) => !e.recurringExpenseId)
    .reduce((s, e) => s + Number(e.amount), 0);
  return {
    revenue: {
      forecast: cents(doneValue + scheduledValue),
      actual: built.totals.serviceRevenue,
      stillScheduled: cents(scheduledValue),
    },
    appointments: { forecast: done._count + scheduled._count, actual: done._count },
    expenses: {
      forecast: cents(Number(recurring._sum.amount ?? 0) + oneOff),
      actual: cents(paidExpenses),
    },
    profit: { actual: built.totals.netProfit },
  };
}

export type RankingRow = {
  id: string;
  name: string;
  count: number;
  revenue: number;
  costs: number;
  contribution: number;
  marginPercent: number | null;
  /** Contribuição por hora de agenda (serviços e profissionais). */
  perHour: number | null;
  estimated: boolean;
};

/**
 * Rentabilidade (competência) por serviço, produto e profissional.
 * Contribuição = cobrado − taxas da maquininha − impostos estimados − materiais − comissão.
 */
export async function getProfitRankings(companyId: string, timezone: string, month: MonthKey) {
  const [data, profile] = await Promise.all([
    loadMonth(companyId, timezone, month, 'accrual'),
    getPricingProfile(companyId),
  ]);
  const taxRate = profile.taxPercent / 100;
  const servicePct = await servicePercents(companyId, data.doneAppointments);
  const materials = materialsByAppointment(data.movements);

  type Acc = {
    name: string;
    count: number;
    revenue: number;
    costs: number;
    minutes: number;
    estimated: boolean;
  };
  const services = new Map<string, Acc>();
  const pros = new Map<string, Acc>();
  const add = (map: Map<string, Acc>, id: string, name: string, v: Omit<Acc, 'name'>) => {
    const row = map.get(id) ?? {
      name,
      count: 0,
      revenue: 0,
      costs: 0,
      minutes: 0,
      estimated: false,
    };
    row.count += v.count;
    row.revenue += v.revenue;
    row.costs += v.costs;
    row.minutes += v.minutes;
    row.estimated ||= v.estimated;
    map.set(id, row);
  };

  for (const a of data.doneAppointments) {
    const charged = chargedOf(a);
    const fee = a.transactions.reduce((s, t) => s + Number(t.feeAmount), 0);
    const mat = materials.get(a.id) ?? { value: 0, estimated: false };
    const commission = commissionOf(a, charged, servicePct);
    const costs = fee + charged * taxRate + mat.value + commission;
    const minutes = a.durationMinutesSnapshot + a.bufferMinutes;
    add(pros, a.professionalId, a.professional.name, {
      count: 1,
      revenue: charged,
      costs,
      minutes,
      estimated: mat.estimated,
    });
    const parts = a.items.length
      ? a.items.map((i) => ({
          id: i.serviceId,
          name: i.nameSnapshot,
          price: Number(i.priceSnapshot),
        }))
      : [{ id: a.serviceId, name: a.serviceNameSnapshot, price: Number(a.priceSnapshot) }];
    const listTotal = parts.reduce((s, p) => s + p.price, 0);
    for (const p of parts) {
      const share = listTotal > 0 ? p.price / listTotal : 1 / parts.length;
      add(services, p.id, p.name, {
        count: 1,
        revenue: charged * share,
        costs: costs * share,
        minutes: minutes * share,
        estimated: mat.estimated,
      });
    }
  }

  const products = new Map<string, Acc>();
  for (const m of data.movements) {
    if (m.type !== 'SALE') continue;
    const c = movementCost(m);
    const unitPrice = m.unitPrice ?? m.product.salePrice;
    const revenue = Number(unitPrice) * m.quantity;
    add(products, m.product.id, m.product.name, {
      count: m.quantity,
      revenue,
      costs: c.value + revenue * taxRate,
      minutes: 0,
      estimated: c.estimated || m.unitPrice === null,
    });
  }

  const toRows = (map: Map<string, Acc>, withHours: boolean): RankingRow[] =>
    [...map.entries()]
      .map(([id, r]) => {
        const contribution = r.revenue - r.costs;
        return {
          id,
          name: r.name,
          count: r.count,
          revenue: cents(r.revenue),
          costs: cents(r.costs),
          contribution: cents(contribution),
          marginPercent: r.revenue > 0 ? Math.round((contribution / r.revenue) * 1000) / 10 : null,
          perHour: withHours && r.minutes > 0 ? cents(contribution / (r.minutes / 60)) : null,
          estimated: r.estimated,
        };
      })
      .sort((a, b) => b.contribution - a.contribution);

  return {
    services: toRows(services, true),
    products: toRows(products, false),
    professionals: toRows(pros, true),
    taxRateUsed: profile.taxPercent,
  };
}

/** Atendimentos (ou vendas) por trás de uma linha do ranking. */
export async function getRankingDrill(
  companyId: string,
  timezone: string,
  month: MonthKey,
  dimension: 'service' | 'product' | 'professional',
  id: string,
) {
  const data = await loadMonth(companyId, timezone, month, 'accrual');
  if (dimension === 'product') {
    return data.movements
      .filter((m) => m.type === 'SALE' && m.product.id === id)
      .map((m) => ({
        date: m.createdAt,
        description: `${m.product.name} × ${m.quantity}`,
        detail: m.reason,
        amount: cents(Number(m.unitPrice ?? m.product.salePrice) * m.quantity),
      }));
  }
  return data.doneAppointments
    .filter((a) =>
      dimension === 'professional'
        ? a.professionalId === id
        : a.serviceId === id || a.items.some((i) => i.serviceId === id),
    )
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .map((a) => ({
      date: a.startAt,
      description: a.items.length
        ? a.items.map((i) => i.nameSnapshot).join(' + ')
        : a.serviceNameSnapshot,
      detail: `${a.client.name} · ${a.professional.name}`,
      amount: cents(chargedOf(a)),
    }));
}
