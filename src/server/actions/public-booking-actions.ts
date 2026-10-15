'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { validateBookingName, validateBookingPhone } from '@/lib/booking';
import { addDays, calendarDateToUtc, utcToCalendarDate } from '@/lib/time';
import { toActionResult } from '@/server/action-result';
import { buildConfirmationMessage } from '@/server/confirmation-message';
import { rateLimit } from '@/server/rate-limit';
import { scheduleGoogleSync } from '@/server/google/background';
import { UserError, idSchema } from '@/server/errors';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { cancelAppointment, updateAppointmentStatus } from '@/server/data/appointments';
import {
  countBookableProfessionals,
  createPublicBooking,
  getAppointmentForToken,
  getBookableCompany,
  BOOKING_DAYS_AHEAD,
  SLOT_STEP_OPTIONS,
  SlotUnavailableError,
  listAvailabilityRange,
  setOnlineBookingEnabled,
  signAppointmentToken,
} from '@/server/data/public-booking';

const slugSchema = z.string().min(1).max(100);
const dateSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});

/**
 * Horários livres de vários dias (até uma semana) numa chamada: a faixa de dias sabe quais estão
 * sem horário, e trocar de dia dentro da semana não precisa de outra ida ao servidor. Só dias
 * dentro da janela de agendamento.
 */
export async function getPublicAvailabilityAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        slug: slugSchema,
        serviceId: idSchema,
        professionalId: idSchema.optional(),
        from: dateSchema,
        days: z.number().int().min(1).max(7),
      })
      .parse(input);
    await rateLimit('slots', 120, 60_000);
    const company = await getBookableCompany(parsed.slug);
    if (!company) throw new UserError('Agendamento online indisponível.');

    const today = utcToCalendarDate(new Date(), company.timezone);
    const fromTime = calendarDateToUtc(parsed.from, 0, company.timezone).getTime();
    const firstTime = calendarDateToUtc(today, 0, company.timezone).getTime();
    const limitTime = calendarDateToUtc(
      addDays(today, BOOKING_DAYS_AHEAD),
      0,
      company.timezone,
    ).getTime();
    // Dias antes de hoje ou depois da janela não entram (nem pedindo à mão).
    const from = fromTime < firstTime ? today : parsed.from;
    const remaining = Math.round(
      (limitTime - calendarDateToUtc(from, 0, company.timezone).getTime()) / 86_400_000,
    );
    const days = Math.max(0, Math.min(parsed.days, remaining));
    if (days === 0) return {};

    const range = await listAvailabilityRange({
      companyId: company.id,
      timezone: company.timezone,
      serviceId: parsed.serviceId,
      professionalId: parsed.professionalId,
      from,
      days,
    });
    return Object.fromEntries(range);
  });
}

export type PublicBookingResult =
  | {
      kind: 'booked';
      token: string;
      startAt: string;
      endAt: string;
      serviceName: string;
      professionalName: string;
      durationMinutes: number;
      price: number;
    }
  | { kind: 'conflict'; message: string };

export async function createPublicBookingAction(input: unknown) {
  return toActionResult(async (): Promise<PublicBookingResult> => {
    const parsed = z
      .object({
        slug: slugSchema,
        serviceId: idSchema,
        professionalId: idSchema,
        startAt: z.coerce.date(),
        name: z
          .string()
          .max(200)
          .superRefine((value, ctx) => {
            const error = validateBookingName(value);
            if (error) ctx.addIssue({ code: 'custom', message: error });
          }),
        phone: z
          .string()
          .max(30)
          .superRefine((value, ctx) => {
            const error = validateBookingPhone(value);
            if (error) ctx.addIssue({ code: 'custom', message: error });
          }),
        // Campo escondido: gente não preenche, robô preenche.
        website: z.string().max(0).optional(),
      })
      .parse(input);
    await rateLimit('booking', 5, 10 * 60_000);
    const company = await getBookableCompany(parsed.slug);
    if (!company) throw new UserError('Agendamento online indisponível.');

    let appointment;
    try {
      appointment = await createPublicBooking({
        companyId: company.id,
        timezone: company.timezone,
        ...parsed,
      });
    } catch (error) {
      // Conflito é um caminho esperado: a tela volta à escolha de horário sem perder os dados.
      if (error instanceof SlotUnavailableError)
        return { kind: 'conflict', message: error.message };
      throw error;
    }
    scheduleGoogleSync(company.id, [appointment.id]);
    revalidatePath('/agenda');

    const professional = await prisma.professional.findFirst({
      where: { id: appointment.professionalId, companyId: company.id },
      select: { name: true },
    });
    return {
      kind: 'booked',
      token: signAppointmentToken(appointment.id),
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      serviceName: appointment.serviceNameSnapshot,
      professionalName: professional?.name ?? '',
      durationMinutes: appointment.durationMinutesSnapshot,
      price: Number(appointment.priceSnapshot),
    };
  });
}

/** O cliente confirma ou cancela pelo link recebido no WhatsApp. */
export async function respondToAppointmentAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ token: z.string().min(10).max(200), decision: z.enum(['confirm', 'cancel']) })
      .parse(input);
    await rateLimit('respond', 20, 60_000);
    const appointment = await getAppointmentForToken(parsed.token);
    if (!appointment) throw new UserError('Link inválido.');
    if (appointment.status === 'CANCELED' || appointment.status === 'DONE') {
      throw new UserError('Este horário não pode mais ser alterado por aqui.');
    }
    if (appointment.startAt.getTime() < Date.now()) throw new UserError('Este horário já passou.');
    if (parsed.decision === 'confirm') {
      await updateAppointmentStatus({
        companyId: appointment.companyId,
        id: appointment.id,
        status: 'CONFIRMED',
        updatedByUserId: 'client-link',
      });
    } else {
      await cancelAppointment({
        companyId: appointment.companyId,
        id: appointment.id,
        canceledByUserId: 'client-link',
        reason: 'Cancelado pelo cliente pelo link',
      });
    }
    scheduleGoogleSync(appointment.companyId, [appointment.id]);
    revalidatePath('/agenda');
    return { status: parsed.decision === 'confirm' ? 'CONFIRMED' : 'CANCELED' };
  });
}

/** Link de confirmação de um agendamento, para a equipe mandar no WhatsApp. */
export async function getConfirmationLinkAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = idSchema.parse(rawId);
    const { company } = await requireCurrentCompany();
    const appointment = await prisma.appointment.findFirst({
      where: { id, companyId: company.id },
      select: { id: true },
    });
    if (!appointment) throw new UserError('Agendamento não encontrado.');
    const confirmation = await buildConfirmationMessage(company.id, appointment.id);
    if (!confirmation) throw new UserError('Agendamento não encontrado.');
    return confirmation;
  });
}

export async function setOnlineBookingAction(input: unknown) {
  return toActionResult(async () => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(input);
    const { company } = await requireCompanyAdmin();
    if (enabled && company.isDemo) {
      throw new UserError('O agendamento online não fica disponível na empresa de demonstração.');
    }
    // Sem expediente definido o link não teria horário confiável para oferecer.
    if (enabled && (await countBookableProfessionals(company.id)) === 0) {
      throw new UserError(
        'Defina o expediente de pelo menos um profissional antes de ligar o agendamento online.',
      );
    }
    await setOnlineBookingEnabled(company.clerkOrgId, enabled);
    revalidatePath('/configuracoes');
    return { enabled };
  });
}

/** Configurações → Agendamento online: de quantos em quantos minutos o link oferece horários. */
export async function setBookingSlotStepAction(input: unknown) {
  return toActionResult(async () => {
    const { step } = z
      .object({
        step: z.number().refine((v) => (SLOT_STEP_OPTIONS as readonly number[]).includes(v), {
          message: 'Escolha um intervalo válido.',
        }),
      })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    await prisma.company.update({ where: { id: company.id }, data: { bookingSlotStep: step } });
    revalidatePath('/configuracoes');
    return { step };
  });
}
