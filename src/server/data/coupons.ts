import { prisma } from '@/lib/db';
import type { Coupon, CouponDiscountType } from '@/generated/prisma/client';

export type CouponInput = {
  code: string;
  description?: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  expiresAt?: Date | null;
  maxUses?: number | null;
};

export class DuplicateCouponCodeError extends Error {
  constructor() {
    super('Já existe um cupom com esse código.');
    this.name = 'DuplicateCouponCodeError';
  }
}

function assertValidDiscount(data: CouponInput): void {
  if (data.discountType === 'PERCENTAGE' && data.discountValue > 100) {
    throw new Error('Desconto percentual não pode passar de 100%.');
  }
}

export async function listAllCoupons(companyId: string): Promise<Coupon[]> {
  return prisma.coupon.findMany({
    where: { companyId },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getCouponById(companyId: string, id: string): Promise<Coupon | null> {
  return prisma.coupon.findFirst({ where: { id, companyId } });
}

export async function createCoupon(companyId: string, data: CouponInput): Promise<Coupon> {
  assertValidDiscount(data);
  const existing = await prisma.coupon.findFirst({
    where: { companyId, code: data.code },
    select: { id: true },
  });
  if (existing) throw new DuplicateCouponCodeError();

  return prisma.coupon.create({
    data: {
      companyId,
      code: data.code,
      description: data.description || null,
      discountType: data.discountType,
      discountValue: data.discountValue,
      expiresAt: data.expiresAt ?? null,
      maxUses: data.maxUses ?? null,
    },
  });
}

export async function updateCoupon(
  companyId: string,
  id: string,
  data: CouponInput,
): Promise<Coupon> {
  assertValidDiscount(data);
  const existing = await prisma.coupon.findFirst({
    where: { companyId, code: data.code, NOT: { id } },
    select: { id: true },
  });
  if (existing) throw new DuplicateCouponCodeError();

  const result = await prisma.coupon.updateMany({
    where: { id, companyId },
    data: {
      code: data.code,
      description: data.description || null,
      discountType: data.discountType,
      discountValue: data.discountValue,
      expiresAt: data.expiresAt ?? null,
      maxUses: data.maxUses ?? null,
    },
  });
  if (result.count === 0) throw new Error('Coupon not found');

  return (await getCouponById(companyId, id))!;
}

export async function setCouponActive(
  companyId: string,
  id: string,
  active: boolean,
): Promise<void> {
  const result = await prisma.coupon.updateMany({ where: { id, companyId }, data: { active } });
  if (result.count === 0) throw new Error('Coupon not found');
}
