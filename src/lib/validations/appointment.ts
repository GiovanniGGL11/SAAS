import { z } from 'zod';

export const createAppointmentInput = z.object({
  clientId: z.string().min(1),
  professionalId: z.string().min(1),
  serviceId: z.string().min(1),
  startAt: z.coerce.date(),
  notes: z.string().max(2000).optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentInput>;

export const moveAppointmentInput = z.object({
  id: z.string().min(1),
  startAt: z.coerce.date(),
});
export type MoveAppointmentInput = z.infer<typeof moveAppointmentInput>;

export const updateAppointmentStatusInput = z.object({
  id: z.string().min(1),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'DONE', 'NO_SHOW']),
});
export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusInput>;

export const cancelAppointmentInput = z.object({
  id: z.string().min(1),
  reason: z.string().max(500).optional(),
});
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentInput>;
