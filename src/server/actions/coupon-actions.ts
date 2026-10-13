'use server';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';

import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { createCoupon, listAllCoupons, setCouponActive, updateCoupon } from '@/server/data/coupons';
import { couponInput, setCouponActiveInput } from '@/lib/validations/coupon';
import { serializeCoupon } from '@/lib/serialize';

export async function listCouponsAction() {
  const { company } = await requireCompanyAdmin();
  const coupons = await listAllCoupons(company.id);
  return coupons.map(serializeCoupon);
}

export async function createCouponAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = couponInput.parse(input);
    const { company } = await requireCompanyAdmin();

    const coupon = await createCoupon(company.id, parsed);
    return serializeCoupon(coupon);
  });
}

export async function updateCouponAction(rawId: unknown, input: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const parsed = couponInput.parse(input);
    const { company } = await requireCompanyAdmin();

    const coupon = await updateCoupon(company.id, id, parsed);
    return serializeCoupon(coupon);
  });
}

export async function setCouponActiveAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = setCouponActiveInput.parse(input);
    const { company } = await requireCompanyAdmin();

    await setCouponActive(company.id, parsed.id, parsed.active);
  });
}
