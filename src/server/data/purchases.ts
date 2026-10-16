import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { PaymentMethod } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

/*
  Entrada de mercadoria: soma no estoque, recalcula o custo médio de cada produto (o que dá a
  margem real) e lança a compra no financeiro — paga agora ou como conta a pagar.
*/

/** `notRecorded`: só a entrada no estoque, sem lançar pagamento no financeiro. */
export type PurchasePayment = { method: PaymentMethod } | { dueDate: Date } | { notRecorded: true };

export async function createPurchase(params: {
  companyId: string;
  supplier?: string | null;
  invoiceNumber?: string | null;
  items: { productId: string; quantity: number; unitCost: number }[];
  payment: PurchasePayment;
  userId: string;
}) {
  if (params.items.length === 0) throw new UserError('Adicione ao menos um produto.');
  return prisma.$transaction(async (tx) => {
    let total = new Prisma.Decimal(0);
    const lines: { productId: string; quantity: number; unitCost: Prisma.Decimal }[] = [];
    for (const item of params.items) {
      // Trava a linha do produto: duas entradas ao mesmo tempo não calculam o custo médio errado.
      const [product] = await tx.$queryRaw<
        { id: string; name: string; quantity: number; costPrice: string }[]
      >`
        SELECT id, name, quantity, "costPrice" FROM "Product"
        WHERE id = ${item.productId} AND "companyId" = ${params.companyId}
        FOR UPDATE`;
      if (!product) throw new UserError('Produto não encontrado.');
      const unitCost = new Prisma.Decimal(item.unitCost);
      const currentQty = Math.max(0, product.quantity);
      const newQty = product.quantity + item.quantity;
      const averageCost =
        currentQty > 0
          ? new Prisma.Decimal(product.costPrice)
              .mul(currentQty)
              .add(unitCost.mul(item.quantity))
              .div(currentQty + item.quantity)
              .toDecimalPlaces(2)
          : unitCost;
      await tx.product.update({
        where: { id: product.id },
        data: { quantity: newQty, costPrice: averageCost },
      });
      await tx.stockMovement.create({
        data: {
          companyId: params.companyId,
          productId: product.id,
          type: 'IN',
          quantity: item.quantity,
          reason: `Compra${params.supplier ? ` — ${params.supplier.trim()}` : ''}`,
          createdByUserId: params.userId,
        },
      });
      total = total.add(unitCost.mul(item.quantity));
      lines.push({ productId: product.id, quantity: item.quantity, unitCost });
    }

    const paid = 'method' in params.payment;
    const transaction =
      'notRecorded' in params.payment
        ? null
        : await tx.transaction.create({
            data: {
              companyId: params.companyId,
              type: 'EXPENSE',
              status: paid ? 'PAID' : 'PENDING',
              category: 'Produtos e insumos',
              description: `Compra de mercadoria${params.supplier ? ` — ${params.supplier.trim()}` : ''}`,
              notes: params.invoiceNumber ? `NF ${params.invoiceNumber.trim()}` : null,
              amount: total,
              paymentMethod: paid ? (params.payment as { method: PaymentMethod }).method : null,
              paidAt: paid ? new Date() : null,
              dueDate: paid ? null : (params.payment as { dueDate: Date }).dueDate,
              createdByUserId: params.userId,
            },
          });

    const purchase = await tx.stockPurchase.create({
      data: {
        companyId: params.companyId,
        supplier: params.supplier?.trim() || null,
        invoiceNumber: params.invoiceNumber?.trim() || null,
        total,
        transactionId: transaction?.id ?? null,
        createdByUserId: params.userId,
        items: { create: lines },
      },
    });
    return { id: purchase.id, total: Number(total) };
  });
}

export async function listPurchases(companyId: string) {
  const purchases = await prisma.stockPurchase.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { items: { include: { product: { select: { name: true } } } } },
  });
  return purchases.map((p) => ({
    id: p.id,
    supplier: p.supplier,
    invoiceNumber: p.invoiceNumber,
    total: Number(p.total),
    createdAt: p.createdAt,
    items: p.items.map((i) => ({
      name: i.product.name,
      quantity: i.quantity,
      unitCost: Number(i.unitCost),
    })),
  }));
}
