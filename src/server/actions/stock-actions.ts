'use server';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

import { revalidatePath } from 'next/cache';

import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  adjustStock,
  createProduct,
  listActiveProducts,
  listAllProducts,
  listAppointmentProducts,
  listStockMovements,
  sellProductToAppointment,
  setProductActive,
  updateProduct,
} from '@/server/data/stock';
import {
  productInput,
  sellProductInput,
  setProductActiveInput,
  stockAdjustInput,
} from '@/lib/validations/stock';
import { serializeAppointmentProduct, serializeProduct } from '@/lib/serialize';

export async function listProductsAction() {
  const { company } = await requireCurrentCompany();
  const products = await listAllProducts(company.id);
  return products.map(serializeProduct);
}

export async function listActiveProductsAction() {
  const { company } = await requireCurrentCompany();
  const products = await listActiveProducts(company.id);
  return products.map(serializeProduct);
}

export async function createProductAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = productInput.parse(input);
    const { company } = await requireCompanyAdmin();

    const product = await createProduct(company.id, parsed);
    revalidatePath('/estoque');
    return serializeProduct(product);
  });
}

export async function updateProductAction(rawId: unknown, input: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const parsed = productInput.parse(input);
    const { company } = await requireCompanyAdmin();

    const product = await updateProduct(company.id, id, parsed);
    revalidatePath('/estoque');
    return serializeProduct(product);
  });
}

export async function setProductActiveAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = setProductActiveInput.parse(input);
    const { company } = await requireCompanyAdmin();

    await setProductActive(company.id, parsed.id, parsed.active);
    revalidatePath('/estoque');
  });
}

export async function listStockMovementsAction(rawProductId?: unknown) {
  const productId = rawProductId === undefined ? undefined : parseId(rawProductId);
  const { company } = await requireCompanyAdmin();
  return listStockMovements(company.id, { productId });
}

export async function adjustStockAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = stockAdjustInput.parse(input);
    const { userId, company } = await requireCompanyAdmin();

    await adjustStock(company.id, parsed, userId);
    revalidatePath('/estoque');
  });
}

export async function listAppointmentProductsAction(rawAppointmentId: unknown) {
  const appointmentId = parseId(rawAppointmentId);
  const { company } = await requireCurrentCompany();
  const items = await listAppointmentProducts(company.id, appointmentId);
  return items.map((item) => ({ ...serializeAppointmentProduct(item), product: item.product }));
}

export async function sellProductAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = sellProductInput.parse(input);
    const { userId, company } = await requireCurrentCompany();

    const item = await sellProductToAppointment(company.id, parsed, userId);
    revalidatePath('/estoque');
    revalidatePath('/financeiro');
    revalidatePath('/agenda');
    return serializeAppointmentProduct(item);
  });
}
