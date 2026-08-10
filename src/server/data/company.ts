import { prisma } from '@/lib/db';
import type { Company } from '@/generated/prisma/client';

export type ClerkOrgInput = {
  id: string;
  name: string;
  slug: string | null;
};

/**
 * Looks up a Company by its Clerk Organization id. This is the one place
 * in the codebase allowed to query by a single external key — it IS the
 * tenant-resolution boundary, not tenant-scoped domain data.
 */
export async function getCompanyByClerkOrgId(clerkOrgId: string): Promise<Company | null> {
  return prisma.company.findUnique({ where: { clerkOrgId } });
}

/**
 * Idempotent upsert used by both the Clerk webhook and the on-demand
 * provisioning fallback in requireCurrentCompany(), so whichever path
 * "wins the race" produces the same result without duplicating companies.
 */
export async function upsertCompanyFromClerkOrg(org: ClerkOrgInput): Promise<Company> {
  const slug = org.slug && org.slug.length > 0 ? org.slug : org.id;

  return prisma.company.upsert({
    where: { clerkOrgId: org.id },
    update: { name: org.name, slug, deletedAt: null },
    create: { clerkOrgId: org.id, name: org.name, slug },
  });
}

export async function softDeleteCompanyByClerkOrgId(clerkOrgId: string): Promise<void> {
  await prisma.company.updateMany({
    where: { clerkOrgId },
    data: { deletedAt: new Date() },
  });
}
