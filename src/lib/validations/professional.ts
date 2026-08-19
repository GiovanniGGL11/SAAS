import { z } from 'zod';

export const professionalInput = z.object({
  name: z.string().min(1, 'Informe o nome').max(200),
  email: z.union([z.email(), z.literal('')]).optional(),
  phone: z.string().max(30).optional(),
  color: z.string().min(1, 'Selecione uma cor'),
  commissionType: z.enum(['FIXED', 'PERCENTAGE']).nullable().optional(),
  commissionValue: z.coerce.number().min(0).nullable().optional(),
});
export type ProfessionalFormInput = z.infer<typeof professionalInput>;

export const setProfessionalActiveInput = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});
