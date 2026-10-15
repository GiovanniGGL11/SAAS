import { z } from 'zod';

// Toda regra com mensagem própria: sem ela o zod mostra "Too small: expected number to be >0".
export const couponInput = z
  .object({
    code: z
      .string()
      .min(1, 'Informe o código')
      .max(50, 'O código pode ter até 50 caracteres')
      .transform((v) => v.trim().toUpperCase()),
    description: z.string().max(500, 'A descrição pode ter até 500 caracteres').optional(),
    discountType: z.enum(['PERCENTAGE', 'FIXED'], { message: 'Escolha o tipo de desconto' }),
    discountValue: z.coerce
      .number({ message: 'Informe o valor do desconto' })
      .positive('O valor deve ser maior que zero'),
    expiresAt: z.coerce.date({ message: 'Data de validade inválida' }).nullable().optional(),
    maxUses: z.coerce
      .number({ message: 'Informe um número de usos' })
      .int('O limite de usos deve ser um número inteiro')
      .positive('O limite de usos deve ser maior que zero')
      .nullable()
      .optional(),
  })
  .refine((c) => c.discountType !== 'PERCENTAGE' || c.discountValue <= 100, {
    message: 'A porcentagem não pode passar de 100%',
    path: ['discountValue'],
  });
export type CouponFormInput = z.infer<typeof couponInput>;

export const setCouponActiveInput = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});
