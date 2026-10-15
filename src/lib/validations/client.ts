import { z } from 'zod';

import { normalizePhone } from '@/lib/phone';

export const clientInput = z.object({
  name: z.string().min(1, 'Informe o nome').max(200),
  phone: z
    .string()
    .max(30)
    .optional()
    .transform((v) => normalizePhone(v)),
  email: z.union([z.email(), z.literal('')]).optional(),
  cpf: z.string().max(20).optional(),
  birthDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  zipCode: z
    .string()
    .max(9)
    .optional()
    .transform((v) => v?.replace(/\D/g, '') || undefined)
    .refine((v) => !v || v.length === 8, 'CEP deve ter 8 dígitos'),
  street: z.string().max(200).optional(),
  number: z.string().max(20).optional(),
  complement: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z
    .string()
    .max(2)
    .optional()
    .transform((v) => v?.trim().toUpperCase() || undefined),
  referredById: z.string().max(64).nullable().optional(),
});
export type ClientFormInput = z.infer<typeof clientInput>;

export const setClientActiveInput = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

export const setClientVipInput = z.object({
  id: z.string().min(1),
  isVip: z.boolean(),
});
