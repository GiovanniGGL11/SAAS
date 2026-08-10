import { prisma } from '@/lib/db';

/**
 * Every test run gets its own throwaway Company (unique clerkOrgId), so
 * tests can run against a real (dev/test) database without a shared fixture
 * — and tenant-isolation tests get two genuinely separate tenants for free.
 */
export async function createTestCompany(label: string) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const company = await prisma.company.create({
    data: {
      clerkOrgId: `test_org_${label}_${suffix}`,
      name: `Test Company ${label}`,
      slug: `test-company-${label}-${suffix}`,
    },
  });

  const professional = await prisma.professional.create({
    data: {
      companyId: company.id,
      name: `Professional ${label}`,
      color: '#0ea5e9',
    },
  });

  const service = await prisma.service.create({
    data: {
      companyId: company.id,
      name: `Service ${label}`,
      durationMinutes: 30,
      price: 50,
      color: '#22c55e',
    },
  });

  const client = await prisma.client.create({
    data: {
      companyId: company.id,
      name: `Client ${label}`,
      phone: `+1555${suffix.slice(0, 7)}`,
    },
  });

  return { company, professional, service, client };
}

export async function deleteTestCompany(companyId: string) {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.appointment.deleteMany({ where: { companyId } });
  await prisma.scheduleBlock.deleteMany({
    where: { professional: { companyId } },
  });
  await prisma.professionalAvailability.deleteMany({
    where: { professional: { companyId } },
  });
  await prisma.client.deleteMany({ where: { companyId } });
  await prisma.service.deleteMany({ where: { companyId } });
  await prisma.professional.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}
