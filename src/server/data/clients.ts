import { prisma } from '@/lib/db';
import type { Client } from '@/generated/prisma/client';

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
};

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
    },
  });
  if (result.count === 0) throw new Error('Client not found');

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
  if (result.count === 0) throw new Error('Client not found');
}

export async function setClientVip(companyId: string, id: string, isVip: boolean): Promise<void> {
  const result = await prisma.client.updateMany({
    where: { id, companyId },
    data: { isVip },
  });
  if (result.count === 0) throw new Error('Client not found');
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
