import { prisma } from '@/lib/db';
import type { Service } from '@/generated/prisma/client';

export async function listActiveServices(companyId: string): Promise<Service[]> {
  return prisma.service.findMany({
    where: { companyId, active: true },
    orderBy: { name: 'asc' },
  });
}

export async function getServiceById(companyId: string, id: string): Promise<Service | null> {
  return prisma.service.findFirst({ where: { id, companyId } });
}
