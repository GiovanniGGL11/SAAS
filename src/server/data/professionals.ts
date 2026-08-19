import { prisma } from '@/lib/db';
import type { CommissionType, Professional } from '@/generated/prisma/client';

export async function listActiveProfessionals(companyId: string): Promise<Professional[]> {
  return prisma.professional.findMany({
    where: { companyId, active: true },
    orderBy: { name: 'asc' },
  });
}

export async function listAllProfessionals(companyId: string): Promise<Professional[]> {
  return prisma.professional.findMany({
    where: { companyId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
}

export async function getProfessionalById(
  companyId: string,
  id: string,
): Promise<Professional | null> {
  return prisma.professional.findFirst({ where: { id, companyId } });
}

export type ProfessionalInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  color: string;
  commissionType?: CommissionType | null;
  commissionValue?: number | null;
};

export async function createProfessional(
  companyId: string,
  data: ProfessionalInput,
): Promise<Professional> {
  return prisma.professional.create({
    data: {
      companyId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      color: data.color,
      commissionType: data.commissionType ?? null,
      commissionValue: data.commissionValue ?? null,
    },
  });
}

export async function updateProfessional(
  companyId: string,
  id: string,
  data: ProfessionalInput,
): Promise<Professional> {
  const result = await prisma.professional.updateMany({
    where: { id, companyId },
    data: {
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      color: data.color,
      commissionType: data.commissionType ?? null,
      commissionValue: data.commissionValue ?? null,
    },
  });
  if (result.count === 0) throw new Error('Professional not found');

  return (await getProfessionalById(companyId, id))!;
}

export async function setProfessionalActive(
  companyId: string,
  id: string,
  active: boolean,
): Promise<void> {
  const result = await prisma.professional.updateMany({
    where: { id, companyId },
    data: { active },
  });
  if (result.count === 0) throw new Error('Professional not found');
}

export async function getProfessionalMonthlyProduction(
  companyId: string,
  professionalId: string,
): Promise<{ appointmentCount: number; revenue: number }> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const appointments = await prisma.appointment.findMany({
    where: {
      companyId,
      professionalId,
      status: 'DONE',
      startAt: { gte: startOfMonth },
    },
    select: { priceSnapshot: true },
  });

  return {
    appointmentCount: appointments.length,
    revenue: appointments.reduce((sum, a) => sum + Number(a.priceSnapshot), 0),
  };
}
