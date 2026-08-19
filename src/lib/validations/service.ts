import { z } from 'zod';

export const serviceInput = z.object({
  name: z.string().min(1, 'Informe o nome').max(200),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
  durationMinutes: z.coerce.number().int().min(5, 'Duração mínima de 5 minutos').max(600),
  price: z.coerce.number().min(0, 'Preço não pode ser negativo'),
  color: z.string().min(1, 'Selecione uma cor'),
});
export type ServiceFormInput = z.infer<typeof serviceInput>;

export const setServiceActiveInput = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});
