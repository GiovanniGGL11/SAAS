import { z } from 'zod';

export const clientInput = z.object({
  name: z.string().min(1, 'Informe o nome').max(200),
  phone: z.string().max(30).optional(),
  email: z.union([z.email(), z.literal('')]).optional(),
  cpf: z.string().max(20).optional(),
  birthDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
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
