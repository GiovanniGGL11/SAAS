import { z } from 'zod';

export const waitlistInput = z.object({
  clientId: z.string().min(1, 'Escolha o cliente'),
  serviceId: z.string().min(1, 'Escolha o serviço'),
  professionalId: z.string().min(1).nullable().optional(),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escolha o dia desejado'),
  notes: z.string().max(300).optional(),
});
export type WaitlistFormInput = z.infer<typeof waitlistInput>;

export const setWaitlistStatusInput = z.object({
  id: z.string().min(1),
  status: z.enum(['FULFILLED', 'CANCELED']),
});
