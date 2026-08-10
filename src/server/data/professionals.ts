import { prisma } from '@/lib/db';
import type { Professional } from '@/generated/prisma/client';

export async function listActiveProfessionals(companyId: string): Promise<Professional[]> {
  return prisma.professional.findMany({
    where: { companyId, active: true },
    orderBy: { name: 'asc' },
  });
}

export async function getProfessionalById(
  companyId: string,
  id: string,
): Promise<Professional | null> {
  return prisma.professional.findFirst({ where: { id, companyId } });
}
