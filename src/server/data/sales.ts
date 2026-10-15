import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { PaymentMethod } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { feeFields } from '@/server/data/finance';

/*
  Vendas fora do atendimento: pacotes e assinaturas, vale-presente e produtos no balcão. O dinheiro
  entra no caixa na venda; depois, sessão de pacote e saldo de vale pagam a comanda sem ser
  dinheiro novo. Qualquer venda pode ficar "no fiado" (entrada pendente ligada ao cliente).
*/

export type SalePayment = { method: PaymentMethod } | { tab: true };

type Db = Prisma.TransactionClient;
const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const brl = (v: Prisma.Decimal | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Lança a entrada da venda: paga (com taxa da maquininha) ou pendente no fiado do cliente. */
async function recordSaleIncome(
  tx: Db,
  params: {
    companyId: string;
    clientId?: string | null;
    category: string;
    description: string;
    amount: Prisma.Decimal;
    payment: SalePayment;
    userId: string;
    notes?: string | null;
  },
) {
  if ('tab' in params.payment && !params.clientId) {
    throw new UserError('Para deixar no fiado, escolha o cliente.');
  }
  const paid = 'method' in params.payment;
  const paidAt = paid ? new Date() : null;
  const paymentMethod = paid ? (params.payment as { method: PaymentMethod }).method : null;
  return tx.transaction.create({
    data: {
      companyId: params.companyId,
      clientId: params.clientId ?? null,
      type: 'INCOME',
      status: paid ? 'PAID' : 'PENDING',
      category: params.category,
      description: params.description,
      notes: params.notes ?? (paid ? null : 'Fiado'),
      amount: params.amount,
      paymentMethod,
      paidAt,
      createdByUserId: params.userId,
      ...(await feeFields(tx, params.companyId, {
        type: 'INCOME',
        status: paid ? 'PAID' : 'PENDING',
        amount: params.amount,
        paymentMethod,
        paidAt,
      })),
    },
  });
}

async function requireClient(tx: Db | typeof prisma, companyId: string, clientId: string) {
  const client = await tx.client.findFirst({
    where: { id: clientId, companyId },
    select: { id: true, name: true },
  });
  if (!client) throw new UserError('Cliente não encontrado.');
  return client;
}

// ---- Planos de pacote / assinatura -----------------------------------------------------------

export type PackagePlanInput = {
  name: string;
  serviceId: string;
  sessions: number;
  price: number;
  validityDays?: number | null;
  recurring: boolean;
};

export async function listPackagePlans(companyId: string) {
  const plans = await prisma.packagePlan.findMany({
    where: { companyId },
    include: {
      service: { select: { name: true } },
      _count: { select: { sold: { where: { status: 'ACTIVE' } } } },
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    serviceId: p.serviceId,
    serviceName: p.service.name,
    sessions: p.sessions,
    price: Number(p.price),
    validityDays: p.validityDays,
    recurring: p.recurring,
    active: p.active,
    activeClients: p._count.sold,
  }));
}

export async function savePackagePlan(
  companyId: string,
  id: string | null,
  data: PackagePlanInput,
) {
  const service = await prisma.service.findFirst({
    where: { id: data.serviceId, companyId },
    select: { id: true },
  });
  if (!service) throw new UserError('Serviço não encontrado.');
  const fields = {
    name: data.name.trim(),
    serviceId: data.serviceId,
    sessions: data.sessions,
    price: data.price,
    validityDays: data.recurring ? null : (data.validityDays ?? null),
    recurring: data.recurring,
  };
  if (!id) return prisma.packagePlan.create({ data: { companyId, ...fields } });
  // Mudar o plano vale para as próximas vendas; quem já comprou fica com o que comprou.
  const result = await prisma.packagePlan.updateMany({ where: { id, companyId }, data: fields });
  if (result.count === 0) throw new UserError('Plano não encontrado.');
}

export async function setPackagePlanActive(companyId: string, id: string, active: boolean) {
  const result = await prisma.packagePlan.updateMany({
    where: { id, companyId },
    data: { active },
  });
  if (result.count === 0) throw new UserError('Plano não encontrado.');
}

// ---- Pacotes do cliente --------------------------------------------------------------------

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export async function sellPackage(params: {
  companyId: string;
  clientId: string;
  planId: string;
  payment: SalePayment;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const client = await requireClient(tx, params.companyId, params.clientId);
    const plan = await tx.packagePlan.findFirst({
      where: { id: params.planId, companyId: params.companyId, active: true },
    });
    if (!plan) throw new UserError('Plano não encontrado ou desativado.');
    const now = new Date();
    const pkg = await tx.clientPackage.create({
      data: {
        companyId: params.companyId,
        clientId: client.id,
        planId: plan.id,
        nameSnapshot: plan.name,
        serviceId: plan.serviceId,
        sessionsTotal: plan.sessions,
        sessionValue: D(plan.price).div(plan.sessions).toDecimalPlaces(2),
        price: plan.price,
        recurring: plan.recurring,
        periodStart: now,
        periodEnd: plan.recurring
          ? addMonths(now, 1)
          : plan.validityDays
            ? new Date(now.getTime() + plan.validityDays * 86_400_000)
            : null,
        createdByUserId: params.userId,
      },
    });
    await recordSaleIncome(tx, {
      companyId: params.companyId,
      clientId: client.id,
      category: plan.recurring ? 'Assinaturas' : 'Pacotes',
      description: `${plan.name} — ${client.name}`,
      amount: D(plan.price),
      payment: params.payment,
      userId: params.userId,
    });
    return pkg;
  });
}

/**
 * Assinaturas: quando o ciclo vence, abre o próximo mês com as sessões zeradas e lança a
 * mensalidade como pendente (a cobrar). Roda ao abrir as telas; o update condicional no período
 * impede renovar duas vezes com duas telas abertas.
 */
export async function ensureMembershipRenewals(companyId: string, userId = 'system') {
  const now = new Date();
  const due = await prisma.clientPackage.findMany({
    where: { companyId, recurring: true, status: 'ACTIVE', periodEnd: { lte: now } },
    include: { client: { select: { name: true } } },
  });
  for (const pkg of due) {
    let periodEnd = pkg.periodEnd!;
    const cycles: Date[] = [];
    while (periodEnd <= now && cycles.length < 12) {
      cycles.push(periodEnd);
      periodEnd = addMonths(periodEnd, 1);
    }
    await prisma.$transaction(async (tx) => {
      const moved = await tx.clientPackage.updateMany({
        where: { id: pkg.id, periodEnd: pkg.periodEnd },
        data: { periodStart: cycles[cycles.length - 1], periodEnd, sessionsUsed: 0 },
      });
      if (moved.count === 0) return;
      for (const start of cycles) {
        await tx.transaction.create({
          data: {
            companyId,
            clientId: pkg.clientId,
            type: 'INCOME',
            status: 'PENDING',
            category: 'Assinaturas',
            description: `${pkg.nameSnapshot} — ${pkg.client.name}`,
            notes: 'Mensalidade da assinatura',
            amount: pkg.price,
            dueDate: start,
            createdByUserId: userId,
          },
        });
      }
    });
  }
}

export async function listClientPackages(companyId: string, clientId: string) {
  await ensureMembershipRenewals(companyId);
  const rows = await prisma.clientPackage.findMany({
    where: { companyId, clientId, status: 'ACTIVE' },
    include: { service: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const now = Date.now();
  return rows.map((p) => ({
    id: p.id,
    name: p.nameSnapshot,
    serviceId: p.serviceId,
    serviceName: p.service.name,
    sessionsTotal: p.sessionsTotal,
    sessionsUsed: p.sessionsUsed,
    remaining: p.sessionsTotal - p.sessionsUsed,
    recurring: p.recurring,
    periodEnd: p.periodEnd,
    expired: !p.recurring && !!p.periodEnd && p.periodEnd.getTime() < now,
  }));
}

export async function cancelClientPackage(companyId: string, id: string) {
  const result = await prisma.clientPackage.updateMany({
    where: { id, companyId, status: 'ACTIVE' },
    data: { status: 'CANCELED' },
  });
  if (result.count === 0) throw new UserError('Pacote não encontrado.');
}

// ---- Vale-presente -------------------------------------------------------------------------

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomCode() {
  let code = '';
  for (let i = 0; i < 8; i++)
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

export async function sellGiftCard(params: {
  companyId: string;
  amount: number;
  buyerName?: string | null;
  recipientName?: string | null;
  clientId?: string | null;
  validityDays?: number | null;
  payment: SalePayment;
  userId: string;
}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (params.clientId) await requireClient(tx, params.companyId, params.clientId);
        const card = await tx.giftCard.create({
          data: {
            companyId: params.companyId,
            code: randomCode(),
            initialAmount: params.amount,
            balance: params.amount,
            buyerName: params.buyerName?.trim() || null,
            recipientName: params.recipientName?.trim() || null,
            clientId: params.clientId ?? null,
            expiresAt: params.validityDays
              ? new Date(Date.now() + params.validityDays * 86_400_000)
              : null,
            createdByUserId: params.userId,
          },
        });
        await recordSaleIncome(tx, {
          companyId: params.companyId,
          clientId: params.clientId,
          category: 'Vale-presente',
          description: `Vale-presente ${card.code}${params.recipientName ? ` — para ${params.recipientName.trim()}` : ''}`,
          amount: D(params.amount),
          payment: params.payment,
          userId: params.userId,
        });
        return card;
      });
    } catch (error) {
      // Código repetido (raríssimo): tenta outro.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
      throw error;
    }
  }
  throw new UserError('Não foi possível gerar o código do vale. Tente de novo.');
}

export async function listGiftCards(companyId: string) {
  const cards = await prisma.giftCard.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const now = Date.now();
  return cards.map((c) => ({
    id: c.id,
    code: c.code,
    initialAmount: Number(c.initialAmount),
    balance: Number(c.balance),
    buyerName: c.buyerName,
    recipientName: c.recipientName,
    expiresAt: c.expiresAt,
    status: c.status,
    expired: !!c.expiresAt && c.expiresAt.getTime() < now,
    createdAt: c.createdAt,
  }));
}

export async function cancelGiftCard(companyId: string, id: string) {
  const result = await prisma.giftCard.updateMany({
    where: { id, companyId, status: 'ACTIVE' },
    data: { status: 'CANCELED' },
  });
  if (result.count === 0) throw new UserError('Vale não encontrado.');
}

// ---- Produtos no balcão --------------------------------------------------------------------

export async function sellProducts(params: {
  companyId: string;
  clientId?: string | null;
  items: { productId: string; quantity: number }[];
  payment: SalePayment;
  userId: string;
}) {
  if (params.items.length === 0) throw new UserError('Adicione ao menos um produto.');
  return prisma.$transaction(async (tx) => {
    if (params.clientId) await requireClient(tx, params.companyId, params.clientId);
    let total = D(0);
    const names: string[] = [];
    for (const item of params.items) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, companyId: params.companyId, active: true },
      });
      if (!product) throw new UserError('Produto não encontrado.');
      // Baixa só se houver quantidade — conferido no próprio UPDATE (duas vendas ao mesmo tempo).
      const updated = await tx.product.updateMany({
        where: { id: product.id, quantity: { gte: item.quantity } },
        data: { quantity: { decrement: item.quantity } },
      });
      if (updated.count === 0) {
        throw new UserError(`Estoque insuficiente de ${product.name} (tem ${product.quantity}).`);
      }
      await tx.stockMovement.create({
        data: {
          companyId: params.companyId,
          productId: product.id,
          type: 'SALE',
          quantity: item.quantity,
          reason: 'Venda no balcão',
          createdByUserId: params.userId,
        },
      });
      total = total.add(D(product.salePrice).mul(item.quantity));
      names.push(`${product.name} × ${item.quantity}`);
    }
    await recordSaleIncome(tx, {
      companyId: params.companyId,
      clientId: params.clientId,
      category: 'Produto',
      description: `Venda no balcão: ${names.join(', ')}`,
      amount: total,
      payment: params.payment,
      userId: params.userId,
    });
    return { total: Number(total) };
  });
}

// ---- Fiado ---------------------------------------------------------------------------------

/** Entradas pendentes do cliente (fiado, mensalidade a cobrar). */
export async function listOpenTab(companyId: string, clientId: string) {
  await ensureMembershipRenewals(companyId);
  const rows = await prisma.transaction.findMany({
    where: { companyId, clientId, type: 'INCOME', status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((t) => ({
    id: t.id,
    description: t.description,
    amount: Number(t.amount),
    createdAt: t.createdAt,
    dueDate: t.dueDate,
  }));
}

export async function receiveTab(companyId: string, transactionId: string, method: PaymentMethod) {
  const current = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      companyId,
      type: 'INCOME',
      status: 'PENDING',
      clientId: { not: null },
    },
  });
  if (!current) throw new UserError('Conta em aberto não encontrada (talvez já recebida).');
  const paidAt = new Date();
  const result = await prisma.transaction.updateMany({
    where: { id: transactionId, companyId, status: 'PENDING' },
    data: {
      status: 'PAID',
      paidAt,
      paymentMethod: method,
      ...(await feeFields(prisma, companyId, {
        ...current,
        status: 'PAID',
        paymentMethod: method,
        paidAt,
      })),
    },
  });
  if (result.count === 0) throw new UserError('Esta conta já foi recebida.');
  return { amount: Number(current.amount), label: brl(current.amount) };
}
