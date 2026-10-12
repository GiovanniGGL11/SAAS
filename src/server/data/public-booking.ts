import { createHmac, timingSafeEqual } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';
import { addDays, calendarDateToUtc, utcToCalendarDate, type CalendarDate } from '@/lib/time';
import { UserError } from '@/server/errors';
import { createAppointment, DEFAULT_DAY_WINDOW } from '@/server/data/appointments';

/**
 * Agendamento online: a página pública /agendar/[slug] onde o cliente escolhe serviço, profissional
 * e horário sozinho. Ligado/desligado pela empresa em Configurações — guardado nos metadados da
 * organização no Clerk, sem coluna nova no banco.
 */

const ACTIVE = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'DONE'] as const;
/** Antecedência mínima: ninguém marca para daqui a 5 minutos sem o salão saber. */
const LEAD_MINUTES = 60;
const STEP_MINUTES = 15;
export const BOOKING_DAYS_AHEAD = 21;

export async function isOnlineBookingEnabled(clerkOrgId: string): Promise<boolean> {
  try {
    const client = await clerkClient();
    const org = await client.organizations.getOrganization({ organizationId: clerkOrgId });
    return org.publicMetadata?.onlineBooking === true;
  } catch {
    return false;
  }
}

export async function setOnlineBookingEnabled(clerkOrgId: string, enabled: boolean) {
  const client = await clerkClient();
  await client.organizations.updateOrganizationMetadata(clerkOrgId, {
    publicMetadata: { onlineBooking: enabled },
  });
}

/** Empresa pelo endereço público, só se o agendamento online estiver ligado. */
export async function getBookableCompany(slug: string) {
  const company = await prisma.company.findFirst({ where: { slug, deletedAt: null } });
  if (!company) return null;
  if (!(await isOnlineBookingEnabled(company.clerkOrgId))) return null;
  return company;
}

export async function getBookingCatalog(companyId: string) {
  const [services, professionals] = await Promise.all([
    prisma.service.findMany({
      where: { companyId, active: true },
      select: { id: true, name: true, durationMinutes: true, price: true, description: true },
      orderBy: { name: 'asc' },
    }),
    prisma.professional.findMany({
      where: { companyId, active: true },
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  return {
    services: services.map((s) => ({ ...s, price: Number(s.price) })),
    professionals,
  };
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + (m || 0);
}

export type PublicSlot = { startAt: string; professionalId: string; label: string };

/**
 * Horários livres de um dia para o serviço: dentro do expediente, sem agendamento nem bloqueio,
 * com a antecedência mínima. Sem profissional escolhido, junta os de todos (um por horário).
 */
export async function listAvailableSlots(params: {
  companyId: string;
  timezone: string;
  serviceId: string;
  professionalId?: string;
  date: CalendarDate;
}): Promise<PublicSlot[]> {
  const service = await prisma.service.findFirst({
    where: { id: params.serviceId, companyId: params.companyId, active: true },
    select: { durationMinutes: true },
  });
  if (!service) throw new UserError('Serviço indisponível.');

  const professionals = await prisma.professional.findMany({
    where: {
      companyId: params.companyId,
      active: true,
      ...(params.professionalId ? { id: params.professionalId } : {}),
    },
    select: { id: true, availabilities: true },
  });
  const dayStart = calendarDateToUtc(params.date, 0, params.timezone);
  const dayEnd = calendarDateToUtc(addDays(params.date, 1), 0, params.timezone);
  const ids = professionals.map((p) => p.id);
  const [busy, blocks] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        companyId: params.companyId,
        professionalId: { in: ids },
        status: { in: [...ACTIVE] },
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
      },
      select: { professionalId: true, startAt: true, endAt: true },
    }),
    prisma.scheduleBlock.findMany({
      where: { professionalId: { in: ids }, startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
      select: { professionalId: true, startAt: true, endAt: true },
    }),
  ]);
  const occupied = [...busy, ...blocks];
  const weekday = new Date(
    Date.UTC(params.date.year, params.date.month - 1, params.date.day),
  ).getUTCDay();
  const earliest = Date.now() + LEAD_MINUTES * 60_000;
  const durationMs = service.durationMinutes * 60_000;
  const byTime = new Map<number, PublicSlot>();

  for (const professional of professionals) {
    // Sem expediente cadastrado, vale a janela padrão; com expediente, só os dias de trabalho.
    const windows = professional.availabilities.length
      ? professional.availabilities
          .filter((a) => a.weekday === weekday)
          .map((a) => ({
            startMinutes: timeToMinutes(a.startTime),
            endMinutes: timeToMinutes(a.endTime),
          }))
      : [DEFAULT_DAY_WINDOW];
    for (const window of windows) {
      for (
        let m = window.startMinutes;
        m + service.durationMinutes <= window.endMinutes;
        m += STEP_MINUTES
      ) {
        const startAt = calendarDateToUtc(params.date, m, params.timezone);
        if (startAt.getTime() < earliest || byTime.has(startAt.getTime())) continue;
        const endAt = startAt.getTime() + durationMs;
        const clash = occupied.some(
          (o) =>
            o.professionalId === professional.id &&
            o.startAt.getTime() < endAt &&
            o.endAt.getTime() > startAt.getTime(),
        );
        if (clash) continue;
        byTime.set(startAt.getTime(), {
          startAt: startAt.toISOString(),
          professionalId: professional.id,
          label: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
        });
      }
    }
  }
  return [...byTime.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/**
 * Reserva feita pelo próprio cliente. O cliente é achado pelo telefone (ou criado); o horário é
 * conferido de novo na criação, com a mesma trava da agenda — dois clientes no mesmo horário não
 * passam juntos.
 */
export async function createPublicBooking(params: {
  companyId: string;
  timezone: string;
  serviceId: string;
  professionalId: string;
  startAt: Date;
  name: string;
  phone: string;
}) {
  const phone = normalizePhone(params.phone);
  if (!phone || phone.length < 10) throw new UserError('Informe um telefone com DDD.');
  if (params.startAt.getTime() < Date.now() + LEAD_MINUTES * 60_000) {
    throw new UserError('Esse horário não está mais disponível. Escolha outro.');
  }
  const lastDay = addDays(utcToCalendarDate(new Date(), params.timezone), BOOKING_DAYS_AHEAD);
  if (params.startAt.getTime() > calendarDateToUtc(lastDay, 0, params.timezone).getTime()) {
    throw new UserError('Data fora do período de agendamento.');
  }

  const client =
    (await prisma.client.findFirst({ where: { companyId: params.companyId, phone } })) ??
    (await prisma.client.create({
      data: { companyId: params.companyId, name: params.name.trim(), phone },
    }));

  try {
    return await createAppointment({
      companyId: params.companyId,
      clientId: client.id,
      professionalId: params.professionalId,
      serviceId: params.serviceId,
      startAt: params.startAt,
      notes: 'Agendado online pelo cliente',
      createdByUserId: 'online-booking',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AppointmentConflictError') {
      throw new UserError('Alguém acabou de reservar esse horário. Escolha outro.');
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Link de confirmação: assinado, sem tabela nova. Vai na mensagem de WhatsApp.
// ---------------------------------------------------------------------------

function secret(): string {
  const value = process.env.BOOKING_LINK_SECRET || process.env.CLERK_SECRET_KEY;
  if (!value) throw new Error('BOOKING_LINK_SECRET não configurado.');
  return value;
}

export function signAppointmentToken(appointmentId: string): string {
  const sig = createHmac('sha256', secret())
    .update(`appt:${appointmentId}`)
    .digest('base64url')
    .slice(0, 22);
  return `${appointmentId}.${sig}`;
}

export function verifyAppointmentToken(token: string): string | null {
  const [id, sig] = token.split('.');
  if (!id || !sig) return null;
  const expected = signAppointmentToken(id).split('.')[1];
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export async function getAppointmentForToken(token: string) {
  const id = verifyAppointmentToken(token);
  if (!id) return null;
  return prisma.appointment.findFirst({
    where: { id },
    include: {
      client: { select: { name: true } },
      professional: { select: { name: true } },
      company: { select: { name: true, timezone: true } },
    },
  });
}
