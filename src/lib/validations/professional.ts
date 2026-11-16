import { z } from 'zod';

import { AVATAR_MAX_CHARS, isAcceptedAvatar } from '@/lib/avatar';

export const professionalInput = z.object({
  name: z.string().min(1, 'Informe o nome').max(200),
  email: z.union([z.email('E-mail inválido. Confira o endereço.'), z.literal('')]).optional(),
  phone: z.string().max(30).optional(),
  color: z.string().min(1, 'Selecione uma cor'),
  commissionType: z.enum(['FIXED', 'PERCENTAGE']).nullable().optional(),
  commissionValue: z.coerce.number().min(0).nullable().optional(),
  monthlyGoal: z.coerce.number().min(0).max(9_999_999).nullable().optional(),
  /** Foto (data URL reduzida). Ausente = mantém; null = remove. */
  avatarUrl: z
    .string()
    .max(AVATAR_MAX_CHARS, 'A foto ficou grande demais. Tente outra.')
    .refine(isAcceptedAvatar, 'Foto inválida.')
    .nullable()
    .optional(),
});
export type ProfessionalFormInput = z.infer<typeof professionalInput>;

export const setProfessionalActiveInput = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});
