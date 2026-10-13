import { prisma } from '@/lib/db';
import type { AppointmentProduct, Product, StockMovement } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

export type ProductInput = {
  name: string;
  sku?: string | null;
  description?: string | null;
  costPrice: number;
  salePrice: number;
  quantity: number;
  minQuantity: number;
};

export async function listAllProducts(companyId: string): Promise<Product[]> {
  return prisma.product.findMany({
    where: { companyId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
}

export async function listActiveProducts(companyId: string): Promise<Product[]> {
  return prisma.product.findMany({
    where: { companyId, active: true },
    orderBy: { name: 'asc' },
  });
}

export async function getProductById(companyId: string, id: string): Promise<Product | null> {
  return prisma.product.findFirst({ where: { id, companyId } });
}

export async function createProduct(companyId: string, data: ProductInput): Promise<Product> {
  return prisma.product.create({
    data: {
      companyId,
      name: data.name,
      sku: data.sku || null,
      description: data.description || null,
      costPrice: data.costPrice,
      salePrice: data.salePrice,
      quantity: data.quantity,
      minQuantity: data.minQuantity,
    },
  });
}

/**
 * quantity is intentionally not editable here — it only changes through
 * adjustStock/sellProductToAppointment so every change leaves a StockMovement.
 */
export async function updateProduct(
  companyId: string,
  id: string,
  data: ProductInput,
): Promise<Product> {
  const result = await prisma.product.updateMany({
    where: { id, companyId },
    data: {
      name: data.name,
      sku: data.sku || null,
      description: data.description || null,
      costPrice: data.costPrice,
      salePrice: data.salePrice,
      minQuantity: data.minQuantity,
    },
  });
  if (result.count === 0) throw new UserError('Produto não encontrado.');

  return (await getProductById(companyId, id))!;
}

export async function setProductActive(
  companyId: string,
  id: string,
  active: boolean,
): Promise<void> {
  const result = await prisma.product.updateMany({ where: { id, companyId }, data: { active } });
  if (result.count === 0) throw new UserError('Produto não encontrado.');
}

export type StockMovementWithProduct = StockMovement & { product: { id: string; name: string } };

export async function listStockMovements(
  companyId: string,
  filters?: { productId?: string },
): Promise<StockMovementWithProduct[]> {
  return prisma.stockMovement.findMany({
    where: { companyId, ...(filters?.productId ? { productId: filters.productId } : {}) },
    include: { product: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function adjustStock(
  companyId: string,
  params: { productId: string; type: 'IN' | 'OUT'; quantity: number; reason?: string | null },
  createdByUserId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: params.productId, companyId } });
    if (!product) throw new UserError('Produto não encontrado.');

    const delta = params.type === 'IN' ? params.quantity : -params.quantity;
    // A conferência do saldo vai no próprio UPDATE: duas saídas ao mesmo tempo não conseguem
    // passar ambas pela checagem e deixar o estoque negativo.
    const updated = await tx.product.updateMany({
      where: {
        id: product.id,
        companyId,
        ...(delta < 0 ? { quantity: { gte: -delta } } : {}),
      },
      data: { quantity: { increment: delta } },
    });
    if (updated.count === 0) throw new UserError('Estoque insuficiente para essa saída.');
    await tx.stockMovement.create({
      data: {
        companyId,
        productId: product.id,
        type: params.type,
        quantity: params.quantity,
        reason: params.reason || null,
        createdByUserId,
      },
    });
  });
}

export type AppointmentProductWithProduct = AppointmentProduct & {
  product: { id: string; name: string };
};

export async function listAppointmentProducts(
  companyId: string,
  appointmentId: string,
): Promise<AppointmentProductWithProduct[]> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, companyId },
    select: { id: true },
  });
  if (!appointment) throw new UserError('Agendamento não encontrado.');

  return prisma.appointmentProduct.findMany({
    where: { appointmentId },
    include: { product: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Sells a product during an appointment: debits stock via a StockMovement
 * (type SALE), records the line item, and generates its own income
 * Transaction — kept separate from the appointment's service-completion
 * transaction (src/server/data/finance.ts::createIncomeFromAppointment)
 * since a checkout can include several product line items.
 */
export async function sellProductToAppointment(
  companyId: string,
  params: { appointmentId: string; productId: string; quantity: number },
  createdByUserId: string,
): Promise<AppointmentProduct> {
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findFirst({
      where: { id: params.appointmentId, companyId },
      select: { id: true, status: true },
    });
    if (!appointment) throw new UserError('Agendamento não encontrado.');
    if (appointment.status === 'CANCELED') {
      throw new UserError('Não dá para vender produto num agendamento cancelado.');
    }

    const product = await tx.product.findFirst({ where: { id: params.productId, companyId } });
    if (!product) throw new UserError('Produto não encontrado.');

    // Baixa e conferência no mesmo UPDATE, para duas vendas simultâneas não passarem do saldo.
    const updated = await tx.product.updateMany({
      where: { id: product.id, companyId, quantity: { gte: params.quantity } },
      data: { quantity: { decrement: params.quantity } },
    });
    if (updated.count === 0) throw new UserError('Estoque insuficiente.');

    await tx.stockMovement.create({
      data: {
        companyId,
        productId: product.id,
        type: 'SALE',
        quantity: params.quantity,
        reason: 'Venda em atendimento',
        createdByUserId,
      },
    });

    const unitPrice = product.salePrice;

    const appointmentProduct = await tx.appointmentProduct.create({
      data: {
        appointmentId: params.appointmentId,
        productId: product.id,
        quantity: params.quantity,
        priceSnapshot: unitPrice,
      },
    });

    await tx.transaction.create({
      data: {
        companyId,
        appointmentId: params.appointmentId,
        type: 'INCOME',
        status: 'PAID',
        description: `${product.name} × ${params.quantity}`,
        category: 'Produto',
        // Decimal, não float: 3 × R$ 19,90 dá 59,70, não 59,699999.
        amount: unitPrice.mul(params.quantity),
        paidAt: new Date(),
        createdByUserId,
      },
    });

    return appointmentProduct;
  });
}
