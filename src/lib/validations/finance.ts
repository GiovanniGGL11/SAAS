import { z } from 'zod';

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'PIX', label: 'PIX' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'DEBIT_CARD', label: 'Cartão de débito' },
  { value: 'BANK_TRANSFER', label: 'Transferência' },
  { value: 'OTHER', label: 'Outro' },
] as const;

export const transactionInput = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  status: z.enum(['PENDING', 'PAID', 'CANCELED']),
  description: z.string().min(1, 'Informe a descrição').max(200),
  category: z.string().max(100).optional(),
  amount: z.coerce.number().positive('O valor deve ser maior que zero'),
  paymentMethod: z
    .enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'OTHER'])
    .nullable()
    .optional(),
  dueDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).optional(),
});
export type TransactionFormInput = z.infer<typeof transactionInput>;
