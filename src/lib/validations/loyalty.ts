import { z } from 'zod';

export const LOYALTY_MODES = [
  { value: 'STAMPS', label: 'Selos' },
  { value: 'POINTS', label: 'Pontos' },
  { value: 'CASHBACK', label: 'Cashback' },
] as const;

export const LOYALTY_REWARD_TYPES = [
  { value: 'FREE_SERVICE', label: 'Serviço grátis' },
  { value: 'PERCENT_DISCOUNT', label: 'Desconto em %' },
  { value: 'FIXED_DISCOUNT', label: 'Desconto em R$' },
  { value: 'CUSTOM', label: 'Personalizada' },
] as const;

export const loyaltyProgramInput = z
  .object({
    active: z.boolean(),
    mode: z.enum(['STAMPS', 'POINTS', 'CASHBACK']),
    stampsRequired: z.coerce.number().int().min(1, 'Mínimo de 1 selo').max(100),
    pointsPerReal: z.coerce.number().positive('Precisa ser maior que zero').max(1000),
    pointsRequired: z.coerce.number().int().min(1, 'Mínimo de 1 ponto').max(1_000_000),
    cashbackPercent: z.coerce.number().positive('Precisa ser maior que zero').max(100),
    rewardType: z.enum(['FREE_SERVICE', 'PERCENT_DISCOUNT', 'FIXED_DISCOUNT', 'CUSTOM']),
    rewardServiceId: z.string().nullable().optional(),
    rewardValue: z.coerce.number().positive().nullable().optional(),
    rewardDescription: z.string().max(200).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // Cashback's reward is the balance itself — nothing else to configure.
    if (data.mode === 'CASHBACK') return;

    if (data.rewardType === 'FREE_SERVICE' && !data.rewardServiceId) {
      ctx.addIssue({ code: 'custom', path: ['rewardServiceId'], message: 'Escolha o serviço' });
    }
    if (
      (data.rewardType === 'PERCENT_DISCOUNT' || data.rewardType === 'FIXED_DISCOUNT') &&
      !data.rewardValue
    ) {
      ctx.addIssue({ code: 'custom', path: ['rewardValue'], message: 'Informe o valor' });
    }
    if (data.rewardType === 'PERCENT_DISCOUNT' && (data.rewardValue ?? 0) > 100) {
      ctx.addIssue({ code: 'custom', path: ['rewardValue'], message: 'Máximo de 100%' });
    }
    if (data.rewardType === 'CUSTOM' && !data.rewardDescription?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['rewardDescription'], message: 'Descreva a recompensa' });
    }
  });
export type LoyaltyProgramFormInput = z.infer<typeof loyaltyProgramInput>;

export const redeemLoyaltyInput = z.object({
  clientId: z.string().min(1),
  /** Cashback only: how much of the balance to use. */
  amount: z.coerce.number().positive().optional(),
});

export const adjustLoyaltyInput = z.object({
  clientId: z.string().min(1),
  amount: z.coerce.number().positive('Informe uma quantidade maior que zero'),
  description: z.string().max(200).optional(),
});
