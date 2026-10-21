import { createHmac, timingSafeEqual } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';
import { validateBookingName, validateBookingPhone } from '@/lib/booking';
import { addDays, calendarDateToUtc, utcToCalendarDate, type CalendarDate } from '@/lib/time';
import { UserError } from '@/server/errors';
import { createAppointment } from '@/server/data/appointments';

/**
 * Agendamento online: a página pública /agendar/[slug] onde o cliente escolhe serviço, profissional
 * e horário sozinho. Ligado/desligado pela empresa em Configurações — guardado nos metadados da
 * organização no Clerk, sem coluna nova no banco.
 */

const ACTIVE = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'DONE'] as const;
/** Antecedência mínima: ninguém marca para daqui a 5 minutos sem o salão saber. */
const LEAD_MINUTES = 60;
/** Intervalos que a empresa pode escolher; 0 = pela duração do serviço. */
export const SLOT_STEP_OPTIONS = [15, 30, 60, 0] as const;
const DEFAULT_SLOT_STEP = 15;

export function slotStepFor(setting: number, durationMinutes: number): number {
  if (setting === 0) return Math.max(5, durationMinutes);
  return (SLOT_STEP_OPTIONS as readonly number[]).includes(setting) ? setting : DEFAULT_SLOT_STEP;
}
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

/** Foto da organização no Clerk, usada como logo da empresa; null se não houver. */
export async function getCompanyLogoUrl(clerkOrgId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const org = await client.organizations.getOrganization({ organizationId: clerkOrgId });
    return org.hasImage ? org.imageUrl : null;
  } catch {
    return null;
  }
}

export async function setOnlineBookingEnabled(clerkOrgId: string, enabled: boolean) {
  const client = await clerkClient();
  await client.organizations.updateOrganizationMetadata(clerkOrgId, {
    publicMetadata: { onlineBooking: enabled },
  });
}

/**
 * Empresa pelo endereço público, só se o agendamento online estiver ligado. A logo é a foto da
 * organização no Clerk (a mesma de Configurações → Organização): uma única consulta serve aos dois.
 */
export async function getBookableCompany(slug: string) {
  const company = await prisma.company.findFirst({ where: { slug, deletedAt: null } });
  if (!company) return null;
  try {
    const client = await clerkClient();
    const org = await client.organizations.getOrganization({ organizationId: company.clerkOrgId });
    if (org.publicMetadata?.onlineBooking !== true) return null;
    return { ...company, logoUrl: org.hasImage ? org.imageUrl : null };
  } catch {
    return null;
  }
}

/** Profissionais ativos sem expediente: enquanto isso não for definido, o link público não os oferece. */
export async function listProfessionalsWithoutSchedule(companyId: string): Promise<string[]> {
  const rows = await prisma.professional.findMany({
    where: { companyId, active: true, availabilities: { none: {} } },
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((p) => p.name);
}

/** Quantos profissionais já podem receber reservas pelo link (ativos e com expediente). */
export async function countBookableProfessionals(companyId: string): Promise<number> {
  return prisma.professional.count({
    where: { companyId, active: true, availabilities: { some: {} } },
  });
}

export async function getBookingCatalog(companyId: string) {
  const [services, professionals] = await Promise.all([
    prisma.service.findMany({
      // Só itens autorizados para o link público; nunca custo, comissão ou dado interno.
      where: { companyId, active: true, publicVisible: true },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        price: true,
        description: true,
        priceKind: true,
      },
      orderBy: { name: 'asc' },
    }),
    // Sem expediente cadastrado não há horário a oferecer: o profissional nem aparece no link.
    prisma.professional.findMany({
      where: { companyId, active: true, availabilities: { some: {} } },
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

function dayKey(d: CalendarDate): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/**
 * Horários livres de vários dias seguidos para o serviço, numa só ida ao banco: dentro do
 * expediente, sem agendamento nem bloqueio, com a antecedência mínima e cabendo inteiro (a duração
 * do serviço termina dentro do expediente). Sem profissional escolhido, junta os de todos (um por
 * horário). A chave do mapa é o dia "AAAA-MM-DD" no fuso da empresa.
 */
export async function listAvailabilityRange(params: {
  companyId: string;
  timezone: string;
  serviceId: string;
  professionalId?: string;
  from: CalendarDate;
  days: number;
  /** Remarcação: o próprio horário não conta como ocupado, e a duração é a do agendamento. */
  reschedule?: { appointmentId: string; durationMinutes: number };
}): Promise<Map<string, PublicSlot[]>> {
  const [found, company] = await Promise.all([
    prisma.service.findFirst({
      where: { id: params.serviceId, companyId: params.companyId, active: true },
      select: { durationMinutes: true },
    }),
    prisma.company.findFirst({
      where: { id: params.companyId },
      select: { bookingSlotStep: true },
    }),
  ]);
  if (!found) throw new UserError('Serviço indisponível.');
  const durationMinutes = params.reschedule?.durationMinutes ?? found.durationMinutes;
  // De quantos em quantos minutos oferecer horário (Configurações → Agendamento online);
  // 0 = pela duração do serviço (30 min → 09:00, 09:30…; 1h → 09:00, 10:00…).
  const stepMinutes = slotStepFor(company?.bookingSlotStep ?? DEFAULT_SLOT_STEP, durationMinutes);

  const professionals = await prisma.professional.findMany({
    where: {
      companyId: params.companyId,
      active: true,
      ...(params.professionalId ? { id: params.professionalId } : {}),
    },
    select: { id: true, availabilities: true },
  });
  const rangeStart = calendarDateToUtc(params.from, 0, params.timezone);
  const rangeEnd = calendarDateToUtc(addDays(params.from, params.days), 0, params.timezone);
  const ids = professionals.map((p) => p.id);
  const [busy, blocks, held] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        companyId: params.companyId,
        professionalId: { in: ids },
        status: { in: [...ACTIVE] },
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
        ...(params.reschedule ? { id: { not: params.reschedule.appointmentId } } : {}),
      },
      select: { professionalId: true, startAt: true, endAt: true },
    }),
    prisma.scheduleBlock.findMany({
      where: { professionalId: { in: ids }, startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      select: { professionalId: true, startAt: true, endAt: true },
    }),
    // Horário segurado por convite pendente da lista de espera.
    prisma.waitlistOffer.findMany({
      where: {
        companyId: params.companyId,
        professionalId: { in: ids },
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      select: { professionalId: true, startAt: true, endAt: true },
    }),
  ]);
  const occupied = [...busy, ...blocks, ...held];
  const earliest = Date.now() + LEAD_MINUTES * 60_000;
  const durationMs = durationMinutes * 60_000;
  const result = new Map<string, PublicSlot[]>();

  for (let offset = 0; offset < params.days; offset++) {
    const date = addDays(params.from, offset);
    const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    const byTime = new Map<number, PublicSlot>();
    for (const professional of professionals) {
      // Só vale o expediente cadastrado, nos dias de trabalho. Sem expediente não há janela
      // "padrão": reservar fora do que a empresa confirmou é o que este link não pode fazer.
      const windows = professional.availabilities
        .filter((a) => a.weekday === weekday)
        .map((a) => ({
          startMinutes: timeToMinutes(a.startTime),
          endMinutes: timeToMinutes(a.endTime),
        }));
      for (const window of windows) {
        for (
          let m = window.startMinutes;
          m + durationMinutes <= window.endMinutes;
          m += stepMinutes
        ) {
          const startAt = calendarDateToUtc(date, m, params.timezone);
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
    result.set(
      dayKey(date),
      [...byTime.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)),
    );
  }
  return result;
}

/** Horários livres de um dia (o mesmo cálculo de listAvailabilityRange). */
export async function listAvailableSlots(params: {
  companyId: string;
  timezone: string;
  serviceId: string;
  professionalId?: string;
  date: CalendarDate;
  reschedule?: { appointmentId: string; durationMinutes: number };
}): Promise<PublicSlot[]> {
  const { date, ...rest } = params;
  const range = await listAvailabilityRange({ ...rest, from: date, days: 1 });
  return range.get(dayKey(date)) ?? [];
}

/** O horário pedido saiu da lista (ocupado, fora do expediente ou já passou): escolher outro. */
export class SlotUnavailableError extends UserError {
  constructor(message = 'Esse horário não está mais disponível. Escolha outro.') {
    super(message);
    this.name = 'SlotUnavailableError';
  }
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
  const nameError = validateBookingName(params.name);
  if (nameError) throw new UserError(nameError);
  const phoneError = validateBookingPhone(params.phone);
  if (phoneError) throw new UserError(phoneError);
  const phone = normalizePhone(params.phone)!;

  const lastDay = addDays(utcToCalendarDate(new Date(), params.timezone), BOOKING_DAYS_AHEAD);
  if (params.startAt.getTime() > calendarDateToUtc(lastDay, 0, params.timezone).getTime()) {
    throw new UserError('Data fora do período de agendamento.');
  }

  const existingClient = await prisma.client.findFirst({
    where: { companyId: params.companyId, phone },
  });
  // O mesmo pedido de novo (duplo clique, nova tentativa depois de falha de rede): devolve a
  // reserva que já foi feita, em vez de acusar conflito com ela mesma.
  if (existingClient) {
    const same = await prisma.appointment.findFirst({
      where: {
        companyId: params.companyId,
        clientId: existingClient.id,
        professionalId: params.professionalId,
        serviceId: params.serviceId,
        startAt: params.startAt,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        createdByUserId: 'online-booking',
        createdAt: { gte: new Date(Date.now() - 15 * 60_000) },
      },
    });
    if (same) return same;
  }

  if (params.startAt.getTime() < Date.now() + LEAD_MINUTES * 60_000) {
    throw new SlotUnavailableError();
  }
  // Serviço interno (fora do catálogo público) não é reservado pelo link.
  const publicService = await prisma.service.findFirst({
    where: { id: params.serviceId, companyId: params.companyId, active: true, publicVisible: true },
    select: { id: true },
  });
  if (!publicService) throw new UserError('Serviço indisponível.');
  // O pedido vem do navegador: só passa um horário que a própria lista de horários ofereceria
  // (dentro do expediente cadastrado, livre, com o profissional e o serviço da empresa).
  const offered = await listAvailableSlots({
    companyId: params.companyId,
    timezone: params.timezone,
    serviceId: params.serviceId,
    professionalId: params.professionalId,
    date: utcToCalendarDate(params.startAt, params.timezone),
  });
  if (!offered.some((slot) => slot.startAt === params.startAt.toISOString())) {
    throw new SlotUnavailableError();
  }

  // Cliente que já existe (mesmo telefone) mantém o nome do cadastro: o link público não altera
  // dados de quem a empresa já conhece.
  const client =
    existingClient ??
    (await prisma.client
      .create({ data: { companyId: params.companyId, name: params.name.trim(), phone } })
      .catch(async (error) => {
        // Dois pedidos ao mesmo tempo com o mesmo telefone: o outro acabou de criar o cadastro.
        const again = await prisma.client.findFirst({
          where: { companyId: params.companyId, phone },
        });
        if (again) return again;
        throw error;
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
      throw new SlotUnavailableError('Alguém acabou de reservar esse horário. Escolha outro.');
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
      company: {
        select: {
          name: true,
          timezone: true,
          street: true,
          number: true,
          complement: true,
          district: true,
          city: true,
          state: true,
          zipCode: true,
        },
      },
    },
  });
}
