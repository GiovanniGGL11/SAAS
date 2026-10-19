import { z } from 'zod';

export const serviceInput = z.object({
  name: z.string().min(1, 'Informe o nome').max(200),
  description: z.string().max(1000).optional(),
  category: z.string().max(100).optional(),
  durationMinutes: z.coerce.number().int().min(5, 'Duração mínima de 5 minutos').max(600),
  price: z.coerce.number().min(0, 'Preço não pode ser negativo'),
  color: z.string().min(1, 'Selecione uma cor'),
  /** Comissão própria do serviço (%); vazio = vale a regra do profissional. */
  commissionPercent: z.coerce.number().min(0).max(100, 'Até 100%').nullable().optional(),
  /** Em quantos dias sugerir o retorno do cliente; vazio = sem sugestão. */
  returnAfterDays: z.coerce
    .number({ message: 'Informe um número de dias' })
    .int('Use um número inteiro de dias')
    .min(1, 'O retorno deve ser de pelo menos 1 dia')
    .max(365, 'Até 365 dias')
    .nullable()
    .optional(),
  /** Materiais do estoque que cada atendimento deste serviço consome (vazio = não consome). */
  supplies: z
    .array(
      z.object({
        productId: z.string().min(1).max(64),
        quantity: z.coerce
          .number({ message: 'Informe a quantidade' })
          .int('Use um número inteiro')
          .min(1, 'A quantidade mínima é 1')
          .max(10000),
      }),
    )
    .max(30)
    .optional(),
  /** Checklist conferido na Visão do atendimento (plano Profissional em diante). */
  checklistItems: z
    .array(z.string().trim().min(1).max(120))
    .max(20, 'Até 20 itens no checklist')
    .refine((items) => new Set(items).size === items.length, 'Há um item repetido no checklist.')
    .optional(),
});
export type ServiceFormInput = z.infer<typeof serviceInput>;

export const setServiceActiveInput = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});
