import { z } from 'zod';

export const couponInput = z.object({
  code: z
    .string()
    .min(1, 'Informe o código')
    .max(50)
    .transform((v) => v.trim().toUpperCase()),
  description: z.string().max(500).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']),
  discountValue: z.coerce.number().positive('O valor deve ser maior que zero'),
  expiresAt: z.coerce.date().nullable().optional(),
  maxUses: z.coerce.number().int().positive().nullable().optional(),
});
export type CouponFormInput = z.infer<typeof couponInput>;

export const setCouponActiveInput = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});
