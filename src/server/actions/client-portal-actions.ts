'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { whatsappLink } from '@/lib/phone';
import { toActionResult } from '@/server/action-result';
import { appBaseUrl } from '@/server/app-url';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { UserError, idSchema } from '@/server/errors';
import { scheduleGoogleSync } from '@/server/google/background';
import { rateLimit } from '@/server/rate-limit';
import { isOnlineBookingEnabled } from '@/server/data/public-booking';
import {
  PORTAL_COOKIE,
  cancelOwnAppointment,
  confirmOwnAppointment,
  createPortalToken,
  getPortalSession,
  listRescheduleSlots,
  rescheduleOwnAppointment,
} from '@/server/data/client-portal';

const dateSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});

// ---- Equipe ---------------------------------------------------------------------------------

/** Link pessoal do cliente e a mensagem pronta para mandar no WhatsApp dele. */
export async function getClientPortalLinkAction(input: unknown) {
  return toActionResult(async () => {
    const { clientId, rotate } = z
      .object({ clientId: idSchema, rotate: z.boolean().default(false) })
      .parse(input);
    const { company } = await requireCurrentCompany();
    const { token, client } = await createPortalToken(company.id, clientId, rotate);

    const url = `${await appBaseUrl()}/c/${token}`;
    const firstName = client.name.trim().split(/\s+/)[0];
    const message =
      `Olá, ${firstName}! Este é o seu acesso à área do cliente da ${company.name}:\n${url}\n\n` +
      'Por lá você vê seus horários, remarca ou cancela e acompanha sua fidelidade. ' +
      'O link é pessoal, não compartilhe.';
    return { url, message, whatsappUrl: whatsappLink(client.phone, message) };
  });
}

// ---- Cliente (sem login: a sessão é o cookie do link pessoal) -------------------------------

async function requirePortalSession() {
  await rateLimit('portal', 60, 60_000);
  const session = await getPortalSession((await cookies()).get(PORTAL_COOKIE)?.value);
  if (!session) {
    throw new UserError('Seu acesso expirou. Abra de novo o link que o estabelecimento te mandou.');
  }
  return session;
}

function changed(companyId: string, appointmentId: string) {
  scheduleGoogleSync(companyId, [appointmentId]);
  revalidatePath('/agenda');
  revalidatePath('/cliente');
}

export async function confirmMyAppointmentAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = idSchema.parse(rawId);
    const session = await requirePortalSession();
    await confirmOwnAppointment(session, id);
    changed(session.company.id, id);
    return { ok: true };
  });
}

export async function cancelMyAppointmentAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = idSchema.parse(rawId);
    const session = await requirePortalSession();
    await cancelOwnAppointment(session, id);
    changed(session.company.id, id);
    return { ok: true };
  });
}

/** Remarcar pelo celular só vale onde a empresa abriu a agenda para o cliente escolher horário. */
async function requireSelfReschedule() {
  const session = await requirePortalSession();
  if (!(await isOnlineBookingEnabled(session.company.clerkOrgId))) {
    throw new UserError('Para remarcar, fale com a gente pelo WhatsApp.');
  }
  return session;
}

export async function getMyRescheduleSlotsAction(input: unknown) {
  return toActionResult(async () => {
    const { appointmentId, date } = z
      .object({ appointmentId: idSchema, date: dateSchema })
      .parse(input);
    const session = await requireSelfReschedule();
    return listRescheduleSlots(session, appointmentId, date);
  });
}

export async function rescheduleMyAppointmentAction(input: unknown) {
  return toActionResult(async () => {
    const { appointmentId, startAt } = z
      .object({ appointmentId: idSchema, startAt: z.coerce.date() })
      .parse(input);
    const session = await requireSelfReschedule();
    await rescheduleOwnAppointment(session, appointmentId, startAt);
    changed(session.company.id, appointmentId);
    return { ok: true };
  });
}

/** "Sair deste aparelho": apaga só o cookie; o link continua valendo para abrir de novo. */
export async function signOutPortalAction() {
  (await cookies()).delete(PORTAL_COOKIE);
}
