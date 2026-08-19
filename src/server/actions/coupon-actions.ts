'use server';

import { revalidatePath } from 'next/cache';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { createCoupon, listAllCoupons, setCouponActive, updateCoupon } from '@/server/data/coupons';
import { couponInput, setCouponActiveInput } from '@/lib/validations/coupon';
import { serializeCoupon } from '@/lib/serialize';

export async function listCouponsAction() {
  const { company } = await requireCurrentCompany();
  const coupons = await listAllCoupons(company.id);
  return coupons.map(serializeCoupon);
}

export async function createCouponAction(input: unknown) {
  const parsed = couponInput.parse(input);
  const { company } = await requireCurrentCompany();

  const coupon = await createCoupon(company.id, parsed);
  revalidatePath('/campanhas');
  return serializeCoupon(coupon);
}

export async function updateCouponAction(id: string, input: unknown) {
  const parsed = couponInput.parse(input);
  const { company } = await requireCurrentCompany();

  const coupon = await updateCoupon(company.id, id, parsed);
  revalidatePath('/campanhas');
  return serializeCoupon(coupon);
}

export async function setCouponActiveAction(input: unknown) {
  const parsed = setCouponActiveInput.parse(input);
  const { company } = await requireCurrentCompany();

  await setCouponActive(company.id, parsed.id, parsed.active);
  revalidatePath('/campanhas');
}
