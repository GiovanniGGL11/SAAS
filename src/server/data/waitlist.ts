import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { getTodayInTz, utcToCalendarDate, type CalendarDate } from '@/lib/time';
import { listAvailableSlots, type PublicSlot } from '@/server/data/public-booking';

export type WaitlistInput = {
  clientId: string;
  serviceId: string;
  professionalId?: string | null;
  desiredDate: string;
  notes?: string | null;
};

const entryInclude = {
  client: { select: { id: true, name: true, phone: true } },
  service: { select: { id: true, name: true, color: true } },
  professional: { select: { id: true, name: true } },
} satisfies Prisma.WaitlistEntryInclude;

export type WaitlistEntryWithRelations = Prisma.WaitlistEntryGetPayload<{
  include: typeof entryInclude;
}>;

function todayKey(timezone: string): string {
  const { year, month, day } = getTodayInTz(timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Quem ainda espera vaga, do dia mais próximo para o mais distante. Dias que já passaram saem. */
export async function listWaitingEntries(
  companyId: string,
  timezone: string,
): Promise<WaitlistEntryWithRelations[]> {
  return prisma.waitlistEntry.findMany({
    where: { companyId, status: 'WAITING', desiredDate: { gte: todayKey(timezone) } },
    include: entryInclude,
    orderBy: [{ desiredDate: 'asc' }, { createdAt: 'asc' }],
    take: 200,
  });
}

export async function createWaitlistEntry(
  companyId: string,
  timezone: string,
  userId: string,
  input: WaitlistInput,
): Promise<WaitlistEntryWithRelations> {
  if (input.desiredDate < todayKey(timezone)) {
    throw new UserError('Esse dia já passou. Escolha hoje ou uma data futura.');
  }
  const [client, service, professional] = await Promise.all([
    prisma.client.findFirst({ where: { id: input.clientId, companyId } }),
    prisma.service.findFirst({ where: { id: input.serviceId, companyId } }),
    input.professionalId
      ? prisma.professional.findFirst({ where: { id: input.professionalId, companyId } })
      : Promise.resolve(null),
  ]);
  if (!client) throw new UserError('O cliente escolhido não pertence a esta empresa.');
  if (!service) throw new UserError('O serviço escolhido não pertence a esta empresa.');
  if (input.professionalId && !professional) {
    throw new UserError('O profissional escolhido não pertence a esta empresa.');
  }

  const duplicate = await prisma.waitlistEntry.findFirst({
    where: {
      companyId,
      clientId: client.id,
      serviceId: service.id,
      desiredDate: input.desiredDate,
      status: 'WAITING',
    },
  });
  if (duplicate) throw new UserError('Esse cliente já está na lista de espera para esse dia.');

  return prisma.waitlistEntry.create({
    data: {
      companyId,
      clientId: client.id,
      serviceId: service.id,
      professionalId: professional?.id ?? null,
      desiredDate: input.desiredDate,
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
}

// ---- Encaixe: quem da lista cabe nas vagas abertas ------------------------------------------------

export type WaitlistSlot = { startAt: string; label: string; professionalName: string };

/** Quantas pessoas da lista são conferidas de uma vez (os dias mais próximos primeiro). */
const MATCH_LIMIT = 40;

function keyToDate(key: string): CalendarDate {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/**
 * Vagas livres agora no dia que cada pessoa da lista quer: mesmo serviço, o profissional que ela
 * pediu (ou qualquer um), dentro do expediente — a mesma conta do agendamento online. Uma consulta
 * por combinação dia/serviço/profissional, não por pessoa.
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

  const groups = new Map<string, Promise<PublicSlot[]>>();
  for (const entry of entries) {
    const key = `${entry.desiredDate}|${entry.serviceId}|${entry.professionalId ?? ''}`;
    if (!groups.has(key)) {
      groups.set(
        key,
        listAvailableSlots({
          companyId,
          timezone,
          serviceId: entry.serviceId,
          professionalId: entry.professionalId ?? undefined,
          date: keyToDate(entry.desiredDate),
          // Serviço desativado não tem vaga: a lista só mostra "sem vaga".
        }).catch(() => []),
      );
    }
  }

  const result: Record<string, WaitlistSlot[]> = {};
  for (const entry of entries) {
    const key = `${entry.desiredDate}|${entry.serviceId}|${entry.professionalId ?? ''}`;
    const slots = await groups.get(key)!;
    result[entry.id] = slots.slice(0, 4).map((s) => ({
      startAt: s.startAt,
      label: s.label,
      professionalName: nameOf.get(s.professionalId) ?? '',
    }));
  }
  return result;
}

export type FreedSlotMatch = {
  entryId: string;
  clientName: string;
  phone: string | null;
  serviceName: string;
  label: string;
  message: string;
};

/**
 * Abriu uma vaga (cancelamento): quem da lista de espera daquele dia cabe nela — o serviço da
 * pessoa precisa ter um horário livre dentro do intervalo que ficou vago, com aquele profissional.
 */
export async function findWaitlistMatchesForFreedSlot(
  companyId: string,
  timezone: string,
  freed: { professionalId: string; startAt: Date; endAt: Date },
): Promise<FreedSlotMatch[]> {
  const date = utcToCalendarDate(freed.startAt, timezone);
  const key = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  const entries = await prisma.waitlistEntry.findMany({
    where: {
      companyId,
      status: 'WAITING',
      desiredDate: key,
      OR: [{ professionalId: null }, { professionalId: freed.professionalId }],
    },
    include: entryInclude,
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  const byService = new Map<string, Promise<PublicSlot[]>>();
  const matches: FreedSlotMatch[] = [];
  for (const entry of entries) {
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
      const at = new Date(s.startAt).getTime();
      return at >= freed.startAt.getTime() && at < freed.endAt.getTime();
    });
    if (!slot) continue;
    const first = entry.client.name.trim().split(/\s+/)[0];
    matches.push({
      entryId: entry.id,
      clientName: entry.client.name,
      phone: entry.client.phone,
      serviceName: entry.service.name,
      label: slot.label,
      message: `Olá, ${first}! Abriu uma vaga para ${entry.service.name} no dia que você pediu: ${formatDayLabel(date)} às ${slot.label}. Quer que eu reserve para você?`,
    });
  }
  return matches;
}

function formatDayLabel(date: CalendarDate): string {
  return `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}`;
}
