import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

/*
  Materiais que cada serviço consome do estoque. O consumo acontece quando o atendimento é
  CONCLUÍDO (uma vez só) e volta ao estoque se a conclusão for desfeita ou o atendimento
  cancelado. O estoque nunca fica negativo por causa de um atendimento: baixa o que houver e
  registra o que faltou, para o aviso do sino mostrar.
*/

type Db = Prisma.TransactionClient | typeof prisma;

export type SupplyInput = { productId: string; quantity: number };

const CONSUME_PREFIX = 'Consumo no atendimento';
const RESTORE_PREFIX = 'Estorno do consumo';

export async function listServiceSupplies(companyId: string, serviceId: string) {
  const rows = await prisma.serviceSupply.findMany({
    where: { companyId, serviceId },
    include: { product: { select: { name: true, quantity: true, active: true } } },
    orderBy: { product: { name: 'asc' } },
  });
  return rows.map((r) => ({
    productId: r.productId,
    productName: r.product.name,
    quantity: r.quantity,
    stock: r.product.quantity,
    productActive: r.product.active,
  }));
}

/** Confere antes de salvar o serviço: produtos da empresa, sem repetição, quantidade inteira ≥ 1. */
export async function assertSupplies(companyId: string, supplies: SupplyInput[]) {
  const ids = supplies.map((s) => s.productId);
  if (new Set(ids).size !== ids.length)
    throw new UserError('Há um produto repetido na lista de materiais.');
  if (
    supplies.some((s) => !Number.isInteger(s.quantity) || s.quantity < 1 || s.quantity > 10_000)
  ) {
    throw new UserError('A quantidade de cada material deve ser um número inteiro maior que zero.');
  }
  if (ids.length === 0) return;
  const found = await prisma.product.count({ where: { companyId, id: { in: ids } } });
  if (found !== ids.length) throw new UserError('Produto não encontrado no estoque.');
}

/** Substitui a lista de materiais do serviço (lista vazia = o serviço não consome estoque). */
export async function setServiceSupplies(
  companyId: string,
  serviceId: string,
  supplies: SupplyInput[],
) {
  await assertSupplies(companyId, supplies);
  const service = await prisma.service.findFirst({
    where: { id: serviceId, companyId },
    select: { id: true },
  });
  if (!service) throw new UserError('Serviço não encontrado.');
  await prisma.$transaction(async (tx) => {
    await tx.serviceSupply.deleteMany({ where: { serviceId, companyId } });
    if (supplies.length) {
      await tx.serviceSupply.createMany({
        data: supplies.map((s) => ({
          companyId,
          serviceId,
          productId: s.productId,
          quantity: s.quantity,
        })),
      });
    }
  });
}

/** Serviços do atendimento (os itens, ou o serviço principal quando é um só). */
async function appointmentServiceIds(db: Db, appointmentId: string, mainServiceId: string) {
  const items = await db.appointmentItem.findMany({
    where: { appointmentId },
    select: { serviceId: true },
  });
  return items.length ? items.map((i) => i.serviceId) : [mainServiceId];
}

/** Líquido já baixado deste atendimento, por produto (consumo menos estorno), em uma consulta só. */
async function netConsumed(db: Db, companyId: string, appointmentId: string) {
  const rows = await db.$queryRaw<{ productId: string; net: number }[]>`
    SELECT "productId",
           COALESCE(SUM(CASE
             WHEN type = 'OUT' AND reason LIKE ${CONSUME_PREFIX + '%'} THEN quantity
             WHEN type = 'IN' AND reason LIKE ${RESTORE_PREFIX + '%'} THEN -quantity
             ELSE 0 END), 0)::int AS net
    FROM "StockMovement"
    WHERE "companyId" = ${companyId} AND "appointmentId" = ${appointmentId}
    GROUP BY "productId"`;
  return new Map(rows.map((row) => [row.productId, row.net]));
}

/**
 * Baixa os materiais do atendimento concluído. Idempotente: se já há consumo líquido registrado
 * para o atendimento, não baixa de novo (clique duplo, nova tentativa).
 */
export async function consumeSuppliesForAppointment(
  tx: Prisma.TransactionClient,
  params: { companyId: string; appointmentId: string; serviceId: string; userId: string },
) {
  const serviceIds = await appointmentServiceIds(tx, params.appointmentId, params.serviceId);
  const supplies = await tx.serviceSupply.findMany({
    where: { companyId: params.companyId, serviceId: { in: serviceIds } },
  });
  // Serviço sem material: nada a baixar (e nenhuma outra consulta).
  if (supplies.length === 0) return { consumed: [], shortages: [] };
  const already = await netConsumed(tx, params.companyId, params.appointmentId);
  if ([...already.values()].some((n) => n > 0)) return { consumed: [], shortages: [] };

  const needed = new Map<string, number>();
  for (const supply of supplies) {
    needed.set(supply.productId, (needed.get(supply.productId) ?? 0) + supply.quantity);
  }

  const consumed: { productId: string; quantity: number }[] = [];
  const shortages: { productId: string; missing: number }[] = [];
  for (const [productId, quantity] of needed) {
    // Trava a linha: dois atendimentos concluídos ao mesmo tempo não baixam o mesmo saldo.
    const [product] = await tx.$queryRaw<{ id: string; quantity: number; active: boolean }[]>`
      SELECT id, quantity, active FROM "Product"
      WHERE id = ${productId} AND "companyId" = ${params.companyId} FOR UPDATE`;
    if (!product) continue;
    const take = Math.min(quantity, Math.max(product.quantity, 0));
    if (take < quantity) shortages.push({ productId, missing: quantity - take });
    if (take <= 0) continue;
    await tx.product.update({ where: { id: productId }, data: { quantity: { decrement: take } } });
    await tx.stockMovement.create({
      data: {
        companyId: params.companyId,
        productId,
        type: 'OUT',
        quantity: take,
        reason: `${CONSUME_PREFIX}${take < quantity ? ` (faltaram ${quantity - take})` : ''}`,
        appointmentId: params.appointmentId,
        createdByUserId: params.userId,
      },
    });
    consumed.push({ productId, quantity: take });
  }
  return { consumed, shortages };
}

/** Devolve ao estoque o que o atendimento baixou (conclusão desfeita ou atendimento cancelado). */
export async function restoreSuppliesForAppointment(
  tx: Prisma.TransactionClient,
  params: { companyId: string; appointmentId: string; userId: string },
) {
  const net = await netConsumed(tx, params.companyId, params.appointmentId);
  for (const [productId, quantity] of net) {
    if (quantity <= 0) continue;
    await tx.product.updateMany({
      where: { id: productId, companyId: params.companyId },
      data: { quantity: { increment: quantity } },
    });
    await tx.stockMovement.create({
      data: {
        companyId: params.companyId,
        productId,
        type: 'IN',
        quantity,
        reason: RESTORE_PREFIX,
        appointmentId: params.appointmentId,
        createdByUserId: params.userId,
      },
    });
  }
}

/**
 * Materiais que faltam para os atendimentos marcados dos próximos dias (para o aviso do sino):
 * soma o que cada atendimento vai pedir e compara com o estoque de hoje.
 */
export async function listUpcomingSupplyShortages(
  companyId: string,
  range: { from: Date; to: Date },
  limit = 8,
) {
  const appointments = await prisma.appointment.findMany({
    where: {
      companyId,
      status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
      startAt: { gte: range.from, lt: range.to },
    },
    select: { serviceId: true, items: { select: { serviceId: true } } },
  });
  if (appointments.length === 0) return [];
  const serviceCount = new Map<string, number>();
  for (const a of appointments) {
    const ids = a.items.length ? a.items.map((i) => i.serviceId) : [a.serviceId];
    for (const id of ids) serviceCount.set(id, (serviceCount.get(id) ?? 0) + 1);
  }
  const supplies = await prisma.serviceSupply.findMany({
    where: { companyId, serviceId: { in: [...serviceCount.keys()] } },
    include: { product: { select: { id: true, name: true, quantity: true, active: true } } },
  });
  const need = new Map<string, { name: string; stock: number; needed: number }>();
  for (const supply of supplies) {
    if (!supply.product.active) continue;
    const entry = need.get(supply.productId) ?? {
      name: supply.product.name,
      stock: supply.product.quantity,
      needed: 0,
    };
    entry.needed += supply.quantity * (serviceCount.get(supply.serviceId) ?? 0);
    need.set(supply.productId, entry);
  }
  return [...need.entries()]
    .filter(([, v]) => v.needed > v.stock)
    .map(([productId, v]) => ({ productId, ...v }))
    .slice(0, limit);
}
