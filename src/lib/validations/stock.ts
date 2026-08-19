import { z } from 'zod';

export const productInput = z.object({
  name: z.string().min(1, 'Informe o nome').max(200),
  sku: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  costPrice: z.coerce.number().min(0, 'Preço de custo não pode ser negativo'),
  salePrice: z.coerce.number().min(0, 'Preço de venda não pode ser negativo'),
  quantity: z.coerce.number().int().min(0, 'Quantidade não pode ser negativa'),
  minQuantity: z.coerce.number().int().min(0, 'Quantidade mínima não pode ser negativa'),
});
export type ProductFormInput = z.infer<typeof productInput>;

export const setProductActiveInput = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

export const stockAdjustInput = z.object({
  productId: z.string().min(1, 'Selecione um produto'),
  type: z.enum(['IN', 'OUT']),
  quantity: z.coerce.number().int().positive('Informe uma quantidade maior que zero'),
  reason: z.string().max(500).optional(),
});
export type StockAdjustFormInput = z.infer<typeof stockAdjustInput>;

export const sellProductInput = z.object({
  appointmentId: z.string().min(1),
  productId: z.string().min(1, 'Selecione um produto'),
  quantity: z.coerce.number().int().positive('Informe uma quantidade maior que zero'),
});
export type SellProductFormInput = z.infer<typeof sellProductInput>;
