import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import {
  addDays,
  calendarDateToUtc,
  getTodayInTz,
  utcToCalendarDate,
  type CalendarDate,
} from '@/lib/time';
import { whatsappLink } from '@/lib/phone';
import { acceptedProfessionals, slotFitsEntry, type WaitlistPreferences } from '@/lib/waitlist';
import {
  listAvailabilityRange,
  listAvailableSlots,
  type PublicSlot,
} from '@/server/data/public-booking';
import {
  AppointmentConflictError,
  assertNoConflict,
  createAppointment,
  lockProfessionalSchedule,
} from '@/server/data/appointments';
import { recordAuditLog } from '@/server/data/audit';

/*
  Lista de espera.
  - Entrada: um dia específico OU preferências (profissionais aceitos, dias da semana, faixa de
    horário, validade do interesse) e o canal que o cliente autorizou.
  - Convite: oferece UM horário a UMA pessoa, com prazo de resposta; enquanto pendente, o horário
    fica segurado (agenda, link público e outros convites respeitam). Aceitar revalida a agenda e
    cria o agendamento uma vez só. Nunca dispara para a lista inteira.
  - Envio real de mensagem depende da integração do WhatsApp e da autorização; sem isso, a equipe
    manda pelo próprio WhatsApp (link pronto) e registra a resposta.
*/

export type WaitlistInput = {
  clientId: string;
  serviceId: string;
  professionalId?: string | null;
  desiredDate?: string | null;
  acceptedProfessionalIds?: string[];
  weekdays?: number[];
  timeFrom?: number | null;
  timeTo?: number | null;
  validUntil?: string | null;
  contactChannel?: 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'NONE';
  notes?: string | null;
};

const entryInclude = {
  client: { select: { id: true, name: true, phone: true } },
  service: {
    select: { id: true, name: true, color: true, durationMinutes: true, bufferMinutes: true },
  },
  professional: { select: { id: true, name: true } },
  offers: {
    where: { status: 'PENDING' },
    select: { id: true, startAt: true, expiresAt: true, professionalId: true },
  },
} satisfies Prisma.WaitlistEntryInclude;

export type WaitlistEntryWithRelations = Prisma.WaitlistEntryGetPayload<{
  include: typeof entryInclude;
}>;

const TX = { maxWait: 10_000, timeout: 20_000 };
/** Quantos dias à frente procurar vaga para quem tem preferências (sem dia específico). */
const SCAN_DAYS = 14;
/** Quantas pessoas da lista são conferidas de uma vez (as mais antigas primeiro). */
const MATCH_LIMIT = 40;

function todayKey(timezone: string): string {
  const { year, month, day } = getTodayInTz(timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function keyToDate(key: string): CalendarDate {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

function endOfDay(key: string, timezone: string): Date {
  return new Date(calendarDateToUtc(addDays(keyToDate(key), 1), 0, timezone).getTime() - 1);
}

function prefs(entry: {
  professionalId: string | null;
  acceptedProfessionalIds: string[];
  desiredDate: string | null;
  weekdays: number[];
  timeFrom: number | null;
  timeTo: number | null;
  validUntil: Date | null;
}): WaitlistPreferences {
  return {
    professionalId: entry.professionalId,
    acceptedProfessionalIds: entry.acceptedProfessionalIds,
    desiredDate: entry.desiredDate,
    weekdays: entry.weekdays,
    timeFrom: entry.timeFrom,
    timeTo: entry.timeTo,
    validUntil: entry.validUntil,
  };
}

/** Encerra convites sem resposta no prazo e interesses vencidos. Chamado ao listar e na rotina. */
export async function expireWaitlist(companyId: string) {
  const now = new Date();
  const [offers] = await Promise.all([
    prisma.waitlistOffer.updateMany({
      where: { companyId, status: 'PENDING', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    }),
    prisma.waitlistEntry.updateMany({
      where: { companyId, status: 'WAITING', validUntil: { lt: now } },
      data: { status: 'EXPIRED' },
    }),
  ]);
  return { expiredOffers: offers.count };
}

/** Quem ainda espera vaga, dos mais antigos para os mais novos. Dias específicos que já passaram saem. */
export async function listWaitingEntries(
  companyId: string,
  timezone: string,
): Promise<WaitlistEntryWithRelations[]> {
  await expireWaitlist(companyId);
  return prisma.waitlistEntry.findMany({
    where: {
      companyId,
      status: 'WAITING',
      OR: [{ desiredDate: null }, { desiredDate: { gte: todayKey(timezone) } }],
    },
    include: entryInclude,
    orderBy: [{ createdAt: 'asc' }],
    take: 200,
  });
}

export async function createWaitlistEntry(
  companyId: string,
  timezone: string,
  userId: string,
  input: WaitlistInput,
): Promise<WaitlistEntryWithRelations> {
  const today = todayKey(timezone);
  if (input.desiredDate && input.desiredDate < today) {
    throw new UserError('Esse dia já passou. Escolha hoje ou uma data futura.');
  }
  if (input.validUntil && input.validUntil < today) {
    throw new UserError('A validade do interesse precisa ser hoje ou depois.');
  }
  if (input.timeFrom != null && input.timeTo != null && input.timeFrom >= input.timeTo) {
    throw new UserError('O horário final precisa ser depois do inicial.');
  }
  const accepted = [...new Set(input.acceptedProfessionalIds ?? [])];
  const proIds = [
    ...new Set([...accepted, ...(input.professionalId ? [input.professionalId] : [])]),
  ];
  const [client, service, professionals] = await Promise.all([
    prisma.client.findFirst({ where: { id: input.clientId, companyId } }),
    prisma.service.findFirst({ where: { id: input.serviceId, companyId } }),
    proIds.length
      ? prisma.professional.findMany({ where: { id: { in: proIds }, companyId } })
      : Promise.resolve([]),
  ]);
  if (!client) throw new UserError('O cliente escolhido não pertence a esta empresa.');
  if (!service) throw new UserError('O serviço escolhido não pertence a esta empresa.');
  if (professionals.length !== proIds.length) {
    throw new UserError('O profissional escolhido não pertence a esta empresa.');
  }

  const duplicate = await prisma.waitlistEntry.findFirst({
    where: {
      companyId,
      clientId: client.id,
      serviceId: service.id,
      desiredDate: input.desiredDate ?? null,
      status: 'WAITING',
    },
  });
  if (duplicate) {
    throw new UserError(
      input.desiredDate
        ? 'Esse cliente já está na lista de espera para esse dia.'
        : 'Esse cliente já está na lista de espera para esse serviço.',
    );
  }

  return prisma.waitlistEntry.create({
    data: {
      companyId,
      clientId: client.id,
      serviceId: service.id,
      professionalId: accepted.length === 1 ? accepted[0] : (input.professionalId ?? null),
      acceptedProfessionalIds: accepted,
      desiredDate: input.desiredDate ?? null,
      weekdays: [...new Set(input.weekdays ?? [])].sort(),
      timeFrom: input.timeFrom ?? null,
      timeTo: input.timeTo ?? null,
      validUntil: input.validUntil ? endOfDay(input.validUntil, timezone) : null,
      contactChannel: input.contactChannel ?? 'WHATSAPP',
      notes: input.notes?.trim() || null,
      createdByUserId: userId,
    },
    include: entryInclude,
  });
}

export async function setWaitlistEntryStatus(
  companyId: string,
  id: string,
  status: 'FULFILLED' | 'CANCELED',
): Promise<void> {
  const result = await prisma.waitlistEntry.updateMany({
    where: { id, companyId, status: 'WAITING' },
    data: { status },
  });
  if (result.count === 0) throw new UserError('Esse item não está mais na lista de espera.');
  // Sai da lista: convite pendente cai e o horário é liberado.
  await prisma.waitlistOffer.updateMany({
    where: { companyId, entryId: id, status: 'PENDING' },
    data: { status: 'CANCELED' },
  });
}

// ---- Encaixe: quem da lista cabe nas vagas abertas ------------------------------------------------

export type WaitlistSlot = {
  startAt: string;
  label: string;
  dayKey: string;
  professionalId: string;
  professionalName: string;
};

/**
 * Vagas livres agora para cada pessoa da lista, respeitando as preferências — a mesma conta do
 * agendamento online. Uma consulta de vários dias por combinação serviço/profissional, não por pessoa.
 */
export async function findOpenSlotsForWaitlist(
  companyId: string,
  timezone: string,
): Promise<Record<string, WaitlistSlot[]>> {
  const entries = (await listWaitingEntries(companyId, timezone)).slice(0, MATCH_LIMIT);
  if (entries.length === 0) return {};
  const professionals = await prisma.professional.findMany({
    where: { companyId },
    select: { id: true, name: true },
  });
  const nameOf = new Map(professionals.map((p) => [p.id, p.name]));
  const today = getTodayInTz(timezone);

  const groups = new Map<string, Promise<Map<string, PublicSlot[]>>>();
  const rangeFor = (
    serviceId: string,
    professionalId: string | null,
    from: CalendarDate,
    days: number,
  ) => {
    const key = `${serviceId}|${professionalId ?? ''}|${from.year}-${from.month}-${from.day}|${days}`;
    if (!groups.has(key)) {
      groups.set(
        key,
        listAvailabilityRange({
          companyId,
          timezone,
          serviceId,
          professionalId: professionalId ?? undefined,
          from,
          days,
        }).catch(() => new Map()),
      );
    }
    return groups.get(key)!;
  };

  const result: Record<string, WaitlistSlot[]> = {};
  for (const entry of entries) {
    const from = entry.desiredDate ? keyToDate(entry.desiredDate) : today;
    const days = entry.desiredDate ? 1 : SCAN_DAYS;
    const pros = acceptedProfessionals(prefs(entry));
    const found: WaitlistSlot[] = [];
    for (const pro of pros ?? [null]) {
      const range = await rangeFor(entry.serviceId, pro, from, days);
      for (const [day, slots] of range) {
        for (const slot of slots) {
          const startAt = new Date(slot.startAt);
          const endAt = new Date(startAt.getTime() + entry.service.durationMinutes * 60_000);
          if (
            !slotFitsEntry(
              prefs(entry),
              { professionalId: slot.professionalId, startAt, endAt },
              timezone,
            )
          ) {
            continue;
          }
          found.push({
            startAt: slot.startAt,
            label: slot.label,
            dayKey: day,
            professionalId: slot.professionalId,
            professionalName: nameOf.get(slot.professionalId) ?? '',
          });
        }
      }
    }
    result[entry.id] = found.sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, 4);
  }
  return result;
}

export type FreedSlotMatch = {
  entryId: string;
  clientName: string;
  phone: string | null;
  serviceName: string;
  label: string;
  startAt: string;
  professionalId: string;
  message: string;
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0];
}

function formatDayLabel(date: CalendarDate): string {
  return `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}`;
}

/**
 * Abriu uma vaga (cancelamento): quem da lista cabe nela — serviço com horário livre dentro do
 * intervalo, com aquele profissional, dentro das preferências e sem convite pendente. Quem pediu
 * aquele dia vem primeiro; depois, quem está esperando há mais tempo.
 */
export async function findWaitlistMatchesForFreedSlot(
  companyId: string,
  timezone: string,
  freed: { professionalId: string; startAt: Date; endAt: Date },
  limit = 10,
): Promise<FreedSlotMatch[]> {
  await expireWaitlist(companyId);
  const date = utcToCalendarDate(freed.startAt, timezone);
  const key = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  const entries = await prisma.waitlistEntry.findMany({
    where: {
      companyId,
      status: 'WAITING',
      offers: { none: { status: 'PENDING' } },
      OR: [{ desiredDate: key }, { desiredDate: null }],
    },
    include: entryInclude,
    orderBy: { createdAt: 'asc' },
    take: 60,
  });
  entries.sort(
    (a, b) =>
      Number(b.desiredDate === key) - Number(a.desiredDate === key) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const byService = new Map<string, Promise<PublicSlot[]>>();
  const matches: FreedSlotMatch[] = [];
  for (const entry of entries) {
    if (matches.length >= limit) break;
    const pros = acceptedProfessionals(prefs(entry));
    if (pros && !pros.includes(freed.professionalId)) continue;
    if (!byService.has(entry.serviceId)) {
      byService.set(
        entry.serviceId,
        listAvailableSlots({
          companyId,
          timezone,
          serviceId: entry.serviceId,
          professionalId: freed.professionalId,
          date,
        }).catch(() => []),
      );
    }
    const slot = (await byService.get(entry.serviceId)!).find((s) => {
      const at = new Date(s.startAt);
      if (at.getTime() < freed.startAt.getTime() || at.getTime() >= freed.endAt.getTime()) {
        return false;
      }
      const endAt = new Date(at.getTime() + entry.service.durationMinutes * 60_000);
      return slotFitsEntry(
        prefs(entry),
        { professionalId: freed.professionalId, startAt: at, endAt },
        timezone,
      );
    });
    if (!slot) continue;
    matches.push({
      entryId: entry.id,
      clientName: entry.client.name,
      phone: entry.contactChannel === 'WHATSAPP' ? entry.client.phone : null,
      serviceName: entry.service.name,
      label: slot.label,
      startAt: slot.startAt,
      professionalId: freed.professionalId,
      message: `Olá, ${firstName(entry.client.name)}! Abriu uma vaga para ${entry.service.name}: ${formatDayLabel(date)} às ${slot.label}. Quer que eu reserve para você?`,
    });
  }
  return matches;
}

// ---- Convites ------------------------------------------------------------------------------------

const offerInclude = {
  entry: {
    select: {
      id: true,
      contactChannel: true,
      client: { select: { id: true, name: true, phone: true } },
      service: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.WaitlistOfferInclude;

export type WaitlistOfferWithRelations = Prisma.WaitlistOfferGetPayload<{
  include: typeof offerInclude;
}>;

function offerMessage(
  offer: { startAt: Date; expiresAt: Date },
  clientName: string,
  serviceName: string,
  timezone: string,
) {
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, ...opts }).format(d);
  const day = fmt(offer.startAt, { weekday: 'long', day: '2-digit', month: '2-digit' });
  const time = fmt(offer.startAt, { hour: '2-digit', minute: '2-digit' });
  const until = fmt(offer.expiresAt, { hour: '2-digit', minute: '2-digit' });
  return `Olá, ${firstName(clientName)}! Abriu uma vaga para ${serviceName} ${day}, às ${time}. Separei para você até as ${until}. Quer confirmar?`;
}

/**
 * Convida uma pessoa da lista para um horário livre. Revalida tudo no servidor (agenda,
 * expediente, preferências) e segura o horário até o prazo de resposta. Só um convite pendente
 * por horário e por pessoa.
 */
export async function createWaitlistOffer(params: {
  companyId: string;
  timezone: string;
  userId: string;
  entryId: string;
  professionalId: string;
  startAt: Date;
  responseMinutes: number;
  origin?: 'manual' | 'automation';
}) {
  await expireWaitlist(params.companyId);
  const entry = await prisma.waitlistEntry.findFirst({
    where: { id: params.entryId, companyId: params.companyId },
    include: entryInclude,
  });
  if (!entry || entry.status !== 'WAITING') {
    throw new UserError('Essa pessoa não está mais na lista de espera.');
  }
  if (entry.offers.length) {
    throw new UserError('Essa pessoa já tem um convite aguardando resposta.');
  }
  const endAt = new Date(params.startAt.getTime() + entry.service.durationMinutes * 60_000);
  if (
    !slotFitsEntry(
      prefs(entry),
      { professionalId: params.professionalId, startAt: params.startAt, endAt },
      params.timezone,
    )
  ) {
    throw new UserError('Esse horário está fora das preferências desta pessoa.');
  }
  // O horário ainda é oferecido pela agenda (expediente, ocupados, bloqueios e outros convites).
  const slots = await listAvailableSlots({
    companyId: params.companyId,
    timezone: params.timezone,
    serviceId: entry.serviceId,
    professionalId: params.professionalId,
    date: utcToCalendarDate(params.startAt, params.timezone),
  }).catch(() => [] as PublicSlot[]);
  if (!slots.some((s) => s.startAt === params.startAt.toISOString())) {
    throw new UserError('Esse horário não está mais livre. Atualize a lista de vagas.');
  }
  const minutes = Math.min(Math.max(params.responseMinutes, 15), 24 * 60);
  const expiresAt = new Date(
    Math.min(Date.now() + minutes * 60_000, params.startAt.getTime() - 5 * 60_000),
  );
  if (expiresAt.getTime() <= Date.now()) {
    throw new UserError('Esse horário está perto demais para um convite com prazo.');
  }

  const offer = await prisma.$transaction(async (tx) => {
    await lockProfessionalSchedule(tx, params.professionalId);
    try {
      await assertNoConflict(
        {
          companyId: params.companyId,
          professionalId: params.professionalId,
          startAt: params.startAt,
          endAt,
          bufferMinutes: entry.service.bufferMinutes,
        },
        tx,
      );
    } catch (error) {
      if (error instanceof AppointmentConflictError) {
        throw new UserError(
          error.message.includes('reservado')
            ? 'Esse horário já foi oferecido a outra pessoa da lista.'
            : 'Esse horário não está mais livre. Atualize a lista de vagas.',
        );
      }
      throw error;
    }
    const pending = await tx.waitlistOffer.count({
      where: { entryId: entry.id, status: 'PENDING' },
    });
    if (pending) throw new UserError('Essa pessoa já tem um convite aguardando resposta.');
    return tx.waitlistOffer.create({
      data: {
        companyId: params.companyId,
        entryId: entry.id,
        professionalId: params.professionalId,
        serviceId: entry.serviceId,
        startAt: params.startAt,
        endAt,
        expiresAt,
        origin: params.origin ?? 'manual',
        createdByUserId: params.userId,
      },
      include: offerInclude,
    });
  }, TX);

  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'WaitlistOffer',
    entityId: offer.id,
    action: 'offered',
    userId: params.userId,
    metadata: { entryId: entry.id, startAt: params.startAt.toISOString(), origin: offer.origin },
  });

  const message = offerMessage(offer, entry.client.name, entry.service.name, params.timezone);
  return {
    offer,
    message,
    // Envio manual pelo WhatsApp da equipe — só se o cliente autorizou esse canal.
    whatsappUrl:
      entry.contactChannel === 'WHATSAPP' ? whatsappLink(entry.client.phone, message) : null,
  };
}

/**
 * Resposta ao convite (equipe registrando, ou o próprio cliente na área do cliente). Aceitar
 * reivindica o convite uma vez só e cria o agendamento revalidando a agenda; se o horário não
 * estiver mais livre, o convite é encerrado e nada é agendado.
 */
export async function respondWaitlistOffer(params: {
  companyId: string;
  offerId: string;
  accept: boolean;
  actorUserId: string;
  /** Na área do cliente: só convites do próprio cliente. */
  clientId?: string;
}) {
  const now = new Date();
  const offer = await prisma.waitlistOffer.findFirst({
    where: {
      id: params.offerId,
      companyId: params.companyId,
      ...(params.clientId ? { entry: { clientId: params.clientId } } : {}),
    },
    include: { entry: true },
  });
  if (!offer) throw new UserError('Convite não encontrado.');

  const claimed = await prisma.waitlistOffer.updateMany({
    where: { id: offer.id, status: 'PENDING', expiresAt: { gt: now } },
    data: { status: params.accept ? 'ACCEPTED' : 'DECLINED', respondedAt: now },
  });
  if (claimed.count === 0) {
    if (offer.status === 'PENDING' && offer.expiresAt <= now) {
      await prisma.waitlistOffer.updateMany({
        where: { id: offer.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      throw new UserError('O prazo deste convite acabou. O horário foi liberado.');
    }
    throw new UserError('Este convite já foi respondido.');
  }

  if (!params.accept) {
    await recordAuditLog({
      companyId: params.companyId,
      entityType: 'WaitlistOffer',
      entityId: offer.id,
      action: 'declined',
      userId: params.actorUserId,
    });
    return { appointmentId: null };
  }

  try {
    const appointment = await createAppointment({
      companyId: params.companyId,
      clientId: offer.entry.clientId,
      professionalId: offer.professionalId,
      serviceId: offer.serviceId,
      startAt: offer.startAt,
      notes: 'Vaga da lista de espera',
      createdByUserId: params.actorUserId,
      waitlistOfferId: offer.id,
    });
    await prisma.$transaction([
      prisma.waitlistOffer.update({
        where: { id: offer.id },
        data: { appointmentId: appointment.id },
      }),
      prisma.waitlistEntry.updateMany({
        where: { id: offer.entryId, status: 'WAITING' },
        data: { status: 'FULFILLED' },
      }),
    ]);
    await recordAuditLog({
      companyId: params.companyId,
      entityType: 'WaitlistOffer',
      entityId: offer.id,
      action: 'accepted',
      userId: params.actorUserId,
      metadata: { appointmentId: appointment.id },
    });
    return { appointmentId: appointment.id };
  } catch (error) {
    if (error instanceof AppointmentConflictError) {
      await prisma.waitlistOffer.update({
        where: { id: offer.id },
        data: { status: 'CANCELED' },
      });
      throw new UserError(
        'Esse horário não está mais livre, então o convite foi encerrado. A pessoa continua na lista.',
      );
    }
    // Falha inesperada: devolve o convite para pendente (pode tentar de novo).
    await prisma.waitlistOffer.update({
      where: { id: offer.id },
      data: { status: 'PENDING', respondedAt: null },
    });
    throw error;
  }
}

export async function cancelWaitlistOffer(companyId: string, userId: string, offerId: string) {
  const result = await prisma.waitlistOffer.updateMany({
    where: { id: offerId, companyId, status: 'PENDING' },
    data: { status: 'CANCELED' },
  });
  if (!result.count) throw new UserError('Este convite já foi respondido ou encerrado.');
  await recordAuditLog({
    companyId,
    entityType: 'WaitlistOffer',
    entityId: offerId,
    action: 'canceled',
    userId,
  });
}

/** Convites recentes (pendentes primeiro) para a equipe acompanhar. */
export async function listWaitlistOffers(companyId: string) {
  await expireWaitlist(companyId);
  return prisma.waitlistOffer.findMany({
    where: {
      companyId,
      OR: [{ status: 'PENDING' }, { updatedAt: { gte: new Date(Date.now() - 2 * 86_400_000) } }],
    },
    include: offerInclude,
    orderBy: [{ status: 'asc' }, { startAt: 'asc' }],
    take: 50,
  });
}

/** Convites pendentes do próprio cliente (área do cliente). */
export async function listClientOffers(companyId: string, clientId: string) {
  await expireWaitlist(companyId);
  return prisma.waitlistOffer.findMany({
    where: { companyId, status: 'PENDING', entry: { clientId } },
    include: { entry: { select: { service: { select: { name: true } } } } },
    orderBy: { startAt: 'asc' },
    take: 5,
  });
}
