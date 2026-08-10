import { prisma } from '@/lib/db';
import type { Client } from '@/generated/prisma/client';

export async function listClients(companyId: string): Promise<Client[]> {
  return prisma.client.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
  });
}

export async function searchClientsByName(companyId: string, query: string): Promise<Client[]> {
  if (!query.trim()) {
    return listClients(companyId);
  }

  return prisma.client.findMany({
    where: { companyId, name: { contains: query, mode: 'insensitive' } },
    orderBy: { name: 'asc' },
    take: 20,
  });
}

export async function getClientById(companyId: string, id: string): Promise<Client | null> {
  return prisma.client.findFirst({ where: { id, companyId } });
}
