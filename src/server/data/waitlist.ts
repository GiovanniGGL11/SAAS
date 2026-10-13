import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { getTodayInTz } from '@/lib/time';

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
