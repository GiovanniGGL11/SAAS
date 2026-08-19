'use server';

import { revalidatePath } from 'next/cache';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
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
  const parsed = productInput.parse(input);
  const { company } = await requireCurrentCompany();

  const product = await createProduct(company.id, parsed);
  revalidatePath('/estoque');
  return serializeProduct(product);
}

export async function updateProductAction(id: string, input: unknown) {
  const parsed = productInput.parse(input);
  const { company } = await requireCurrentCompany();

  const product = await updateProduct(company.id, id, parsed);
  revalidatePath('/estoque');
  return serializeProduct(product);
}

export async function setProductActiveAction(input: unknown) {
  const parsed = setProductActiveInput.parse(input);
  const { company } = await requireCurrentCompany();

  await setProductActive(company.id, parsed.id, parsed.active);
  revalidatePath('/estoque');
}

export async function listStockMovementsAction(productId?: string) {
  const { company } = await requireCurrentCompany();
  return listStockMovements(company.id, { productId });
}

export async function adjustStockAction(input: unknown) {
  const parsed = stockAdjustInput.parse(input);
  const { userId, company } = await requireCurrentCompany();

  await adjustStock(company.id, parsed, userId);
  revalidatePath('/estoque');
}

export async function listAppointmentProductsAction(appointmentId: string) {
  const { company } = await requireCurrentCompany();
  const items = await listAppointmentProducts(company.id, appointmentId);
  return items.map((item) => ({ ...serializeAppointmentProduct(item), product: item.product }));
}

export async function sellProductAction(input: unknown) {
  const parsed = sellProductInput.parse(input);
  const { userId, company } = await requireCurrentCompany();

  const item = await sellProductToAppointment(company.id, parsed, userId);
  revalidatePath('/estoque');
  revalidatePath('/financeiro');
  revalidatePath('/agenda');
  return serializeAppointmentProduct(item);
}
