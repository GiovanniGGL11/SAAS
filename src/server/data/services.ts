import { prisma } from '@/lib/db';
import type { Service } from '@/generated/prisma/client';

export async function listActiveServices(companyId: string): Promise<Service[]> {
  return prisma.service.findMany({
    where: { companyId, active: true },
    orderBy: { name: 'asc' },
  });
}

export async function listAllServices(companyId: string): Promise<Service[]> {
  return prisma.service.findMany({
    where: { companyId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
}

export async function getServiceById(companyId: string, id: string): Promise<Service | null> {
  return prisma.service.findFirst({ where: { id, companyId } });
}

export type ServiceInput = {
  name: string;
  description?: string | null;
  category?: string | null;
  durationMinutes: number;
  price: number;
  color: string;
};

export async function createService(companyId: string, data: ServiceInput): Promise<Service> {
  return prisma.service.create({
    data: {
      companyId,
      name: data.name,
      description: data.description || null,
      category: data.category || null,
      durationMinutes: data.durationMinutes,
      price: data.price,
      color: data.color,
    },
  });
}

export async function updateService(
  companyId: string,
  id: string,
  data: ServiceInput,
): Promise<Service> {
  const result = await prisma.service.updateMany({
    where: { id, companyId },
    data: {
      name: data.name,
      description: data.description || null,
      category: data.category || null,
      durationMinutes: data.durationMinutes,
      price: data.price,
      color: data.color,
    },
  });
  if (result.count === 0) throw new Error('Service not found');

  return (await getServiceById(companyId, id))!;
}

export async function setServiceActive(
  companyId: string,
  id: string,
  active: boolean,
): Promise<void> {
  const result = await prisma.service.updateMany({
    where: { id, companyId },
    data: { active },
  });
  if (result.count === 0) throw new Error('Service not found');
}
