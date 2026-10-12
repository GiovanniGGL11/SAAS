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
  // Arrastar para a coluna de outro profissional (visão Dia) troca quem atende.
  professionalId: z.string().min(1).optional(),
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

export const appointmentRangeInput = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  professionalId: z.string().min(1).optional(),
  serviceId: z.string().min(1).optional(),
  status: z
    .enum(['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'DONE', 'CANCELED', 'NO_SHOW'])
    .optional(),
});
export type AppointmentRangeInput = z.infer<typeof appointmentRangeInput>;

export const scheduleContextInput = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});

export const createScheduleBlockInput = z.object({
  professionalId: z.string().min(1),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  reason: z.string().max(200).optional(),
});

export const deleteScheduleBlockInput = z.object({ id: z.string().min(1) });

export const nextAvailableSlotInput = z.object({
  serviceId: z.string().min(1),
  professionalId: z.string().min(1).optional(),
  from: z.coerce.date(),
});

export const resizeAppointmentInput = z.object({
  id: z.string().min(1),
  endAt: z.coerce.date(),
});

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido');

export const professionalAvailabilityInput = z.object({
  professionalId: z.string().min(1),
  availabilities: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          startTime: timeString,
          endTime: timeString,
        })
        .refine((a) => a.endTime > a.startTime, 'O fim precisa ser depois do início'),
    )
    .max(28),
});
