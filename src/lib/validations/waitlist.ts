import { z } from 'zod';

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

export const waitlistInput = z
  .object({
    clientId: z.string().min(1, 'Escolha o cliente').max(64),
    serviceId: z.string().min(1, 'Escolha o serviço').max(64),
    professionalId: z.string().min(1).max(64).nullable().optional(),
    /** Dia específico (opcional): sem ele, valem dias da semana e faixa de horário. */
    desiredDate: dateKey.nullable().optional(),
    acceptedProfessionalIds: z.array(z.string().min(1).max(64)).max(30).optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    /** Minutos desde a meia-noite. */
    timeFrom: z.number().int().min(0).max(1440).nullable().optional(),
    timeTo: z.number().int().min(0).max(1440).nullable().optional(),
    validUntil: dateKey.nullable().optional(),
    contactChannel: z.enum(['WHATSAPP', 'PHONE', 'EMAIL', 'NONE']).optional(),
    notes: z.string().max(300).optional(),
  })
  .refine((v) => v.timeFrom == null || v.timeTo == null || v.timeFrom < v.timeTo, {
    message: 'O horário final precisa ser depois do inicial.',
  });
export type WaitlistFormInput = z.infer<typeof waitlistInput>;

export const setWaitlistStatusInput = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(['FULFILLED', 'CANCELED']),
});

export const createOfferInput = z.object({
  entryId: z.string().min(1).max(64),
  professionalId: z.string().min(1).max(64),
  startAt: z.coerce.date(),
  /** Prazo para responder, em minutos (o horário fica segurado até lá). */
  responseMinutes: z
    .number()
    .int()
    .min(15)
    .max(24 * 60)
    .default(120),
});

export const offerIdInput = z.object({ id: z.string().min(1).max(64) });
