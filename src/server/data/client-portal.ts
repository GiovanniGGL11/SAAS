import { createHmac, timingSafeEqual } from 'node:crypto';

import { prisma } from '@/lib/db';
import type { LoyaltyRules } from '@/lib/loyalty';
import { addDays, calendarDateToUtc, utcToCalendarDate, type CalendarDate } from '@/lib/time';
import { UserError } from '@/server/errors';
import {
  cancelAppointment,
  moveAppointment,
  updateAppointmentStatus,
} from '@/server/data/appointments';
import { getClientLoyalty } from '@/server/data/loyalty';
import { BOOKING_DAYS_AHEAD, listAvailableSlots } from '@/server/data/public-booking';
import { companyHasFeature } from '@/server/billing/features';
import { recordAuditLog } from '@/server/data/audit';
import { listClientPortalForms } from '@/server/data/forms';
import { listClientQuotes } from '@/server/data/quotes';
import { listClientOffers } from '@/server/data/waitlist';
import { sessionsDone } from '@/lib/packages';

/**
 * Área do cliente: a equipe manda um link pessoal pelo WhatsApp; ao abrir, o cliente fica
 * conectado naquele aparelho (cookie) e vê os próprios horários, remarca, cancela e acompanha a
 * fidelidade. Sem senha e sem tabela de sessões — o link é assinado e leva a "versão" do cliente;
 * gerar um link novo sobe a versão e derruba todos os anteriores.
 */

export const PORTAL_COOKIE = 'atendafy_cliente';
export const PORTAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
/** Em cima da hora o salão já se organizou: daí pra frente, só pelo WhatsApp. */
export const CHANGE_NOTICE_HOURS = 2;
/** Quem aparece no histórico da agenda quando a mudança vem do cliente. */
const PORTAL_ACTOR = 'client-portal';

const CHANGEABLE = ['SCHEDULED', 'CONFIRMED'] as const;
const UPCOMING = ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as const;

function secret(): string {
  const value = process.env.BOOKING_LINK_SECRET || process.env.CLERK_SECRET_KEY;
  if (!value) throw new Error('BOOKING_LINK_SECRET não configurado.');
  return value;
}

function signature(clientId: string, version: number): string {
  return createHmac('sha256', secret())
    .update(`portal:${clientId}:${version}`)
    .digest('base64url')
    .slice(0, 32);
}

export function signPortalToken(clientId: string, version: number): string {
  return `${clientId}.${version}.${signature(clientId, version)}`;
}

/** Confere só a assinatura; se a versão ainda vale é com o banco (getPortalSession). */
export function readPortalToken(token: string): { clientId: string; version: number } | null {
  const [clientId, rawVersion, sig, ...rest] = token.split('.');
  if (!clientId || !rawVersion || !sig || rest.length > 0) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(clientId) || !/^[1-9]\d{0,8}$/.test(rawVersion)) return null;
  const version = Number(rawVersion);
  const given = Buffer.from(sig);
  const expected = Buffer.from(signature(clientId, version));
  return given.length === expected.length && timingSafeEqual(given, expected)
    ? { clientId, version }
    : null;
}

const sessionSelect = {
  id: true,
  name: true,
  company: {
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      whatsapp: true,
      clerkOrgId: true,
    },
  },
} as const;

export type PortalSession = NonNullable<Awaited<ReturnType<typeof getPortalSession>>>;

/** Cliente dono do link, se o link ainda vale (versão atual, cliente ativo, empresa no ar). */
export async function getPortalSession(token: string | null | undefined) {
  const parsed = token ? readPortalToken(token) : null;
  if (!parsed) return null;
  return prisma.client.findFirst({
    where: {
      id: parsed.clientId,
      portalVersion: parsed.version,
      active: true,
      company: { deletedAt: null },
    },
    select: sessionSelect,
  });
}

const publicCompanySelect = {
  id: true,
  name: true,
  slug: true,
  whatsapp: true,
  clerkOrgId: true,
} as const;

/**
 * Para quem abriu um link antigo: de qual empresa ele era, para oferecer o "Pedir novo link"
 * no WhatsApp certo. A assinatura confirma que fomos nós que mandamos o link.
 */
export async function getCompanyOfStaleToken(token: string) {
  const parsed = readPortalToken(token);
  if (!parsed) return null;
  const client = await prisma.client.findFirst({
    where: { id: parsed.clientId, company: { deletedAt: null } },
    select: { company: { select: publicCompanySelect } },
  });
  return client?.company ?? null;
}

/** Empresa da página "Pedir acesso" (/cliente/entrar/[slug]). */
export async function getPortalCompanyBySlug(slug: string) {
  return prisma.company.findFirst({
    where: { slug, deletedAt: null },
    select: publicCompanySelect,
  });
}

/** Link pessoal de um cliente, para a equipe mandar. `rotate` invalida os links já enviados. */
export async function createPortalToken(companyId: string, clientId: string, rotate = false) {
  if (rotate) {
    await prisma.client.updateMany({
      where: { id: clientId, companyId },
      data: { portalVersion: { increment: 1 } },
    });
  }
  const client = await prisma.client.findFirst({
    where: { id: clientId, companyId },
    select: { id: true, name: true, phone: true, portalVersion: true },
  });
  if (!client) throw new UserError('Cliente não encontrado.');
  return { token: signPortalToken(client.id, client.portalVersion), client };
}

function canChange(appointment: { status: string; startAt: Date }): boolean {
  return (
    (CHANGEABLE as readonly string[]).includes(appointment.status) &&
    appointment.startAt.getTime() - Date.now() >= CHANGE_NOTICE_HOURS * 3_600_000
  );
}

export async function getPortalOverview(session: PortalSession) {
  const companyId = session.company.id;
  const clientId = session.id;
  const now = new Date();

  const appointmentSelect = {
    id: true,
    startAt: true,
    endAt: true,
    status: true,
    serviceNameSnapshot: true,
    priceSnapshot: true,
    professional: { select: { name: true, color: true } },
  } as const;

  const [upcoming, history, loyalty] = await Promise.all([
    prisma.appointment.findMany({
      where: { companyId, clientId, status: { in: [...UPCOMING] }, endAt: { gt: now } },
      orderBy: { startAt: 'asc' },
      take: 20,
      select: appointmentSelect,
    }),
    prisma.appointment.findMany({
      where: {
        companyId,
        clientId,
        OR: [{ status: { in: ['DONE', 'CANCELED', 'NO_SHOW'] } }, { endAt: { lte: now } }],
      },
      orderBy: { startAt: 'desc' },
      take: 10,
      select: appointmentSelect,
    }),
    getClientLoyalty(companyId, clientId),
  ]);

  const serialize = (a: (typeof upcoming)[number]) => ({
    id: a.id,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    status: a.status,
    service: a.serviceNameSnapshot,
    price: Number(a.priceSnapshot),
    professional: a.professional,
    canChange: canChange(a),
  });

  const program = loyalty?.program?.active ? loyalty.program : null;
  // Só as regras do cartão vão para o celular do cliente, não o registro inteiro do programa.
  const rules: LoyaltyRules | null = program && {
    mode: program.mode,
    stampsRequired: program.stampsRequired,
    pointsPerReal: program.pointsPerReal,
    pointsRequired: program.pointsRequired,
    cashbackPercent: program.cashbackPercent,
    rewardType: program.rewardType,
    rewardValue: program.rewardValue,
    rewardDescription: program.rewardDescription,
    rewardService: program.rewardService ? { name: program.rewardService.name } : null,
  };

  return {
    upcoming: upcoming.map(serialize),
    history: history.map(serialize),
    loyalty: rules ? { rules, balance: loyalty?.balance ?? 0 } : null,
    noticeHours: CHANGE_NOTICE_HOURS,
  };
}

export type PortalOverview = Awaited<ReturnType<typeof getPortalOverview>>;
export type PortalAppointment = PortalOverview['upcoming'][number];

async function findOwnAppointment(session: PortalSession, appointmentId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, companyId: session.company.id, clientId: session.id },
  });
  if (!appointment) throw new UserError('Agendamento não encontrado.');
  return appointment;
}

function assertChangeable(appointment: { status: string; startAt: Date }) {
  if (!(CHANGEABLE as readonly string[]).includes(appointment.status)) {
    throw new UserError('Este horário não pode mais ser alterado por aqui.');
  }
  if (!canChange(appointment)) {
    throw new UserError(
      `Faltam menos de ${CHANGE_NOTICE_HOURS} horas. Para mudar agora, fale com a gente pelo WhatsApp.`,
    );
  }
}

export async function confirmOwnAppointment(session: PortalSession, appointmentId: string) {
  const appointment = await findOwnAppointment(session, appointmentId);
  if (appointment.status === 'CONFIRMED') return appointment;
  if (appointment.status !== 'SCHEDULED' || appointment.startAt.getTime() < Date.now()) {
    throw new UserError('Este horário não pode mais ser confirmado.');
  }
  return updateAppointmentStatus({
    companyId: session.company.id,
    id: appointment.id,
    status: 'CONFIRMED',
    updatedByUserId: PORTAL_ACTOR,
  });
}

export async function cancelOwnAppointment(session: PortalSession, appointmentId: string) {
  const appointment = await findOwnAppointment(session, appointmentId);
  assertChangeable(appointment);
  return cancelAppointment({
    companyId: session.company.id,
    id: appointment.id,
    canceledByUserId: PORTAL_ACTOR,
    reason: 'Cancelado pelo cliente na área do cliente',
  });
}

function assertBookableDate(session: PortalSession, date: CalendarDate) {
  const { timezone } = session.company;
  const today = utcToCalendarDate(new Date(), timezone);
  const day = calendarDateToUtc(date, 0, timezone).getTime();
  if (
    day < calendarDateToUtc(today, 0, timezone).getTime() ||
    day > calendarDateToUtc(addDays(today, BOOKING_DAYS_AHEAD), 0, timezone).getTime()
  ) {
    throw new UserError('Data fora do período de agendamento.');
  }
}

/** Horários livres para levar o agendamento: mesmo serviço, mesmo profissional, mesma duração. */
export async function listRescheduleSlots(
  session: PortalSession,
  appointmentId: string,
  date: CalendarDate,
) {
  const appointment = await findOwnAppointment(session, appointmentId);
  assertChangeable(appointment);
  assertBookableDate(session, date);
  const slots = await listAvailableSlots({
    companyId: session.company.id,
    timezone: session.company.timezone,
    serviceId: appointment.serviceId,
    professionalId: appointment.professionalId,
    date,
    reschedule: {
      appointmentId: appointment.id,
      durationMinutes: Math.round(
        (appointment.endAt.getTime() - appointment.startAt.getTime()) / 60_000,
      ),
    },
  });
  // O horário de agora não é "novo horário".
  return slots.filter((slot) => slot.startAt !== appointment.startAt.toISOString());
}

export async function rescheduleOwnAppointment(
  session: PortalSession,
  appointmentId: string,
  startAt: Date,
) {
  const date = utcToCalendarDate(startAt, session.company.timezone);
  // Recalcula a lista no servidor: só passa um horário que a própria tela poderia ter oferecido.
  const slots = await listRescheduleSlots(session, appointmentId, date);
  if (!slots.some((slot) => slot.startAt === startAt.toISOString())) {
    throw new UserError('Esse horário não está mais disponível. Escolha outro.');
  }
  try {
    return await moveAppointment({
      companyId: session.company.id,
      id: appointmentId,
      startAt,
      updatedByUserId: PORTAL_ACTOR,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AppointmentConflictError') {
      throw new UserError('Alguém acabou de reservar esse horário. Escolha outro.');
    }
    throw error;
  }
}

// ---- Área do cliente ampliada (plano Profissional em diante) ----------------------------------

/**
 * Pacotes, fichas a preencher, documentos liberados, orçamentos e convites da lista de espera do
 * próprio cliente. Nada de valores internos (custo, comissão, notas da equipe). `null` quando o
 * plano da empresa não inclui.
 */
export async function getPortalExtras(session: PortalSession) {
  const companyId = session.company.id;
  if (!(await companyHasFeature(companyId, 'clientPortal'))) return null;
  const [packages, forms, quotes, offers, profile] = await Promise.all([
    prisma.clientPackage.findMany({
      where: { companyId, clientId: session.id, status: 'ACTIVE', recurring: false },
      select: {
        id: true,
        nameSnapshot: true,
        sessionsTotal: true,
        periodEnd: true,
        movements: { select: { kind: true, quantity: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    listClientPortalForms(companyId, session.id),
    (await companyHasFeature(companyId, 'quotes'))
      ? listClientQuotes(companyId, session.id)
      : Promise.resolve([]),
    listClientOffers(companyId, session.id),
    prisma.client.findUniqueOrThrow({
      where: { id: session.id },
      select: {
        email: true,
        birthDate: true,
        zipCode: true,
        street: true,
        number: true,
        complement: true,
        district: true,
        city: true,
        state: true,
      },
    }),
  ]);
  return {
    packages: packages.map((p) => {
      const done = sessionsDone(p.movements);
      return {
        id: p.id,
        name: p.nameSnapshot,
        done,
        total: p.sessionsTotal,
        remaining: Math.max(p.sessionsTotal - done, 0),
        validUntil: p.periodEnd?.toISOString() ?? null,
      };
    }),
    forms,
    quotes,
    offers: offers.map((o) => ({
      id: o.id,
      startAt: o.startAt.toISOString(),
      expiresAt: o.expiresAt.toISOString(),
      service: o.entry.service.name,
    })),
    profile: {
      ...profile,
      birthDate: profile.birthDate ? profile.birthDate.toISOString().slice(0, 10) : null,
    },
  };
}

export type PortalExtras = NonNullable<Awaited<ReturnType<typeof getPortalExtras>>>;

export async function assertPortalFeature(session: PortalSession) {
  if (!(await companyHasFeature(session.company.id, 'clientPortal'))) {
    throw new UserError('Este recurso não está disponível. Fale com o estabelecimento.');
  }
}

export type PortalProfileInput = {
  email?: string | null;
  birthDate?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
};

/**
 * Dados que o próprio cliente pode atualizar. Nome, telefone e CPF ficam com a equipe: o
 * telefone identifica o cliente e não pode ser trocado por quem só tem o link.
 */
export async function updateOwnProfile(session: PortalSession, input: PortalProfileInput) {
  await assertPortalFeature(session);
  const clean = (v: string | null | undefined, max: number) => {
    const t = v?.trim() ?? '';
    return t ? t.slice(0, max) : null;
  };
  const email = clean(input.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('E-mail inválido.');
  let birthDate: Date | null = null;
  if (input.birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) throw new UserError('Data inválida.');
    birthDate = new Date(`${input.birthDate}T12:00:00Z`);
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
      throw new UserError('Data de nascimento inválida.');
    }
  }
  const data = {
    email,
    birthDate,
    zipCode: clean(input.zipCode, 9)?.replace(/\D/g, '') || null,
    street: clean(input.street, 200),
    number: clean(input.number, 20),
    complement: clean(input.complement, 100),
    district: clean(input.district, 100),
    city: clean(input.city, 100),
    state: clean(input.state, 2)?.toUpperCase() ?? null,
  };
  await prisma.client.update({ where: { id: session.id }, data });
  await recordAuditLog({
    companyId: session.company.id,
    entityType: 'Client',
    entityId: session.id,
    action: 'updated',
    userId: PORTAL_ACTOR,
    metadata: { fields: Object.keys(data), source: 'client-portal' },
  });
}
