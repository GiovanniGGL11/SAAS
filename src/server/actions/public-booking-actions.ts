'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { toActionResult } from '@/server/action-result';
import { UserError, idSchema } from '@/server/errors';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { cancelAppointment, updateAppointmentStatus } from '@/server/data/appointments';
import {
  createPublicBooking,
  getAppointmentForToken,
  getBookableCompany,
  listAvailableSlots,
  setOnlineBookingEnabled,
  signAppointmentToken,
} from '@/server/data/public-booking';

// ---- Proteção das ações públicas (sem login) --------------------------------------------------
// Limite simples por IP, em memória: segura curiosos e robôs simples numa instância. Não substitui
// um rate limit distribuído (Upstash/Redis) se o tráfego crescer.
const hits = new Map<string, { count: number; resetAt: number }>();
async function rateLimit(key: string, max: number, windowMs: number) {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const id = `${key}:${ip}`;
  const now = Date.now();
  const entry = hits.get(id);
  if (!entry || entry.resetAt < now) {
    hits.set(id, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > max)
    throw new UserError('Muitas tentativas. Aguarde um minuto e tente de novo.');
}

const slugSchema = z.string().min(1).max(100);
const dateSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});

export async function getPublicSlotsAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        slug: slugSchema,
        serviceId: idSchema,
        professionalId: idSchema.optional(),
        date: dateSchema,
      })
      .parse(input);
    await rateLimit('slots', 120, 60_000);
    const company = await getBookableCompany(parsed.slug);
    if (!company) throw new UserError('Agendamento online indisponível.');
    return listAvailableSlots({ companyId: company.id, timezone: company.timezone, ...parsed });
  });
}

export async function createPublicBookingAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        slug: slugSchema,
        serviceId: idSchema,
        professionalId: idSchema,
        startAt: z.coerce.date(),
        name: z.string().trim().min(2, 'Informe seu nome.').max(120),
        phone: z.string().trim().min(10, 'Informe um telefone com DDD.').max(30),
        // Campo escondido: gente não preenche, robô preenche.
        website: z.string().max(0).optional(),
      })
      .parse(input);
    await rateLimit('booking', 5, 10 * 60_000);
    const company = await getBookableCompany(parsed.slug);
    if (!company) throw new UserError('Agendamento online indisponível.');
    const appointment = await createPublicBooking({
      companyId: company.id,
      timezone: company.timezone,
      ...parsed,
    });
    revalidatePath('/agenda');
    return { token: signAppointmentToken(appointment.id) };
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
    const h = await headers();
    const host = h.get('host');
    const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
    const base = process.env.NEXT_PUBLIC_APP_URL || (host ? `${proto}://${host}` : '');
    return { url: `${base}/confirmar/${signAppointmentToken(appointment.id)}` };
  });
}

export async function setOnlineBookingAction(input: unknown) {
  return toActionResult(async () => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(input);
    const { company } = await requireCompanyAdmin();
    await setOnlineBookingEnabled(company.clerkOrgId, enabled);
    revalidatePath('/configuracoes');
    return { enabled };
  });
}
