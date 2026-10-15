import { prisma } from '@/lib/db';
import type { Client, Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

const INACTIVE_AFTER_DAYS = 60;

export async function listClients(companyId: string): Promise<Client[]> {
  return prisma.client.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
  });
}

export async function listActiveClients(companyId: string): Promise<Client[]> {
  return prisma.client.findMany({
    where: { companyId, active: true },
    orderBy: { name: 'asc' },
  });
}

export async function searchClientsByName(companyId: string, query: string): Promise<Client[]> {
  if (!query.trim()) {
    return listActiveClients(companyId);
  }

  return prisma.client.findMany({
    where: { companyId, active: true, name: { contains: query, mode: 'insensitive' } },
    orderBy: { name: 'asc' },
    take: 20,
  });
}

export async function getClientById(companyId: string, id: string): Promise<Client | null> {
  return prisma.client.findFirst({ where: { id, companyId } });
}

export type ClientInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  cpf?: string | null;
  birthDate?: Date | null;
  notes?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  /** Quem indicou (programa de indicação). undefined = não mexe; null = sem indicação. */
  referredById?: string | null;
};

/** Indicação só de outro cliente da mesma empresa (e nunca o próprio). */
async function referralData(companyId: string, data: ClientInput, selfId?: string) {
  if (data.referredById === undefined) return {};
  if (!data.referredById) return { referredById: null };
  if (data.referredById === selfId) throw new UserError('O cliente não pode indicar a si mesmo.');
  const referrer = await prisma.client.findFirst({
    where: { id: data.referredById, companyId },
    select: { id: true },
  });
  if (!referrer) throw new UserError('Cliente que indicou não encontrado.');
  return { referredById: referrer.id };
}

// Campos de endereço vazios viram null para não guardar string em branco.
function addressData(data: ClientInput) {
  return {
    zipCode: data.zipCode || null,
    street: data.street || null,
    number: data.number || null,
    complement: data.complement || null,
    district: data.district || null,
    city: data.city || null,
    state: data.state || null,
  };
}

export async function createClient(companyId: string, data: ClientInput): Promise<Client> {
  return prisma.client.create({
    data: {
      companyId,
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      cpf: data.cpf || null,
      birthDate: data.birthDate ?? null,
      notes: data.notes || null,
      ...addressData(data),
      ...(await referralData(companyId, data)),
    },
  });
}

export async function updateClient(
  companyId: string,
  id: string,
  data: ClientInput,
): Promise<Client> {
  const result = await prisma.client.updateMany({
    where: { id, companyId },
    data: {
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      cpf: data.cpf || null,
      birthDate: data.birthDate ?? null,
      notes: data.notes || null,
      ...addressData(data),
      ...(await referralData(companyId, data, id)),
    },
  });
  if (result.count === 0) throw new UserError('Cliente não encontrado.');

  return (await getClientById(companyId, id))!;
}

export async function setClientActive(
  companyId: string,
  id: string,
  active: boolean,
): Promise<void> {
  const result = await prisma.client.updateMany({
    where: { id, companyId },
    data: { active },
  });
  if (result.count === 0) throw new UserError('Cliente não encontrado.');
}

export async function setClientVip(companyId: string, id: string, isVip: boolean): Promise<void> {
  const result = await prisma.client.updateMany({
    where: { id, companyId },
    data: { isVip },
  });
  if (result.count === 0) throw new UserError('Cliente não encontrado.');
}

export type ClientStats = {
  totalSpent: number;
  appointmentCount: number;
  averageTicket: number;
  lastVisitAt: Date | null;
  isInactive: boolean;
};

export async function getClientStats(companyId: string, clientId: string): Promise<ClientStats> {
  const doneAppointments = await prisma.appointment.findMany({
    where: { companyId, clientId, status: 'DONE' },
    select: { priceSnapshot: true, startAt: true },
    orderBy: { startAt: 'desc' },
  });

  const totalSpent = doneAppointments.reduce((sum, a) => sum + Number(a.priceSnapshot), 0);
  const appointmentCount = doneAppointments.length;
  const lastVisitAt = doneAppointments[0]?.startAt ?? null;
  const daysSinceLastVisit = lastVisitAt
    ? (Date.now() - lastVisitAt.getTime()) / (1000 * 60 * 60 * 24)
    : null;

  return {
    totalSpent,
    appointmentCount,
    averageTicket: appointmentCount > 0 ? totalSpent / appointmentCount : 0,
    lastVisitAt,
    isInactive: daysSinceLastVisit === null || daysSinceLastVisit > INACTIVE_AFTER_DAYS,
  };
}

export async function listClientAppointmentHistory(companyId: string, clientId: string) {
  return prisma.appointment.findMany({
    where: { companyId, clientId },
    include: {
      professional: { select: { id: true, name: true, color: true } },
      service: { select: { id: true, name: true, color: true } },
    },
    orderBy: { startAt: 'desc' },
  });
}

/**
 * Clientes ativos cuja última visita concluída foi há mais de `days` dias e que não têm nada
 * marcado daqui para frente — a lista de quem "sumiu".
 */
export async function listLapsedClients(companyId: string, days: number, limit = 30) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const [lastVisits, upcoming] = await Promise.all([
    prisma.appointment.groupBy({
      by: ['clientId'],
      where: { companyId, status: 'DONE' },
      _max: { startAt: true },
    }),
    prisma.appointment.findMany({
      where: {
        companyId,
        startAt: { gte: new Date() },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
      },
      select: { clientId: true },
      distinct: ['clientId'],
    }),
  ]);
  const hasUpcoming = new Set(upcoming.map((a) => a.clientId));
  const lapsed = lastVisits
    .filter((v) => v._max.startAt && v._max.startAt < cutoff && !hasUpcoming.has(v.clientId))
    .sort((a, b) => a._max.startAt!.getTime() - b._max.startAt!.getTime());
  const lastByClient = new Map(lapsed.map((v) => [v.clientId, v._max.startAt!]));
  const clients = await prisma.client.findMany({
    where: { companyId, active: true, id: { in: [...lastByClient.keys()] } },
    select: { id: true, name: true, phone: true },
  });
  return clients
    .map((c) => ({ ...c, lastVisitAt: lastByClient.get(c.id)! }))
    .sort((a, b) => b.lastVisitAt.getTime() - a.lastVisitAt.getTime())
    .slice(0, limit);
}

export type ImportClientRow = {
  name: string;
  phone?: string;
  email?: string;
  cpf?: string;
  birthDate?: Date;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
};

/**
 * Importação em lote (planilha de outro sistema). Telefone repetido — já cadastrado ou repetido no
 * próprio arquivo — é pulado, não sobrescreve ninguém.
 */
export async function importClients(
  companyId: string,
  rows: ImportClientRow[],
): Promise<{ created: number; skipped: number }> {
  const existing = await prisma.client.findMany({
    where: { companyId, phone: { not: null } },
    select: { phone: true },
  });
  const seen = new Set(existing.map((c) => c.phone!));
  const data: Prisma.ClientCreateManyInput[] = [];
  let skipped = 0;
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) {
      skipped++;
      continue;
    }
    if (row.phone) {
      if (seen.has(row.phone)) {
        skipped++;
        continue;
      }
      seen.add(row.phone);
    }
    data.push({
      companyId,
      name: name.slice(0, 200),
      phone: row.phone || null,
      email: row.email || null,
      cpf: row.cpf || null,
      birthDate: row.birthDate ?? null,
      ...addressData(row),
    });
  }
  const result = await prisma.client.createMany({ data, skipDuplicates: true });
  return { created: result.count, skipped: skipped + (data.length - result.count) };
}
