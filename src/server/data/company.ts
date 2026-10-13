import { prisma } from '@/lib/db';
import type { Company } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';

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

/**
 * Only `timezone` — `name`/`slug` are mirrored from the Clerk Organization
 * (see upsertCompanyFromClerkOrg) and edited there (Clerk's
 * OrganizationProfile UI), so editing them here too would just get
 * overwritten on the next organization.updated webhook.
 */
export async function updateCompanyTimezone(companyId: string, timezone: string): Promise<void> {
  const result = await prisma.company.updateMany({
    where: { id: companyId },
    data: { timezone },
  });
  if (result.count === 0) throw new UserError('Empresa não encontrada.');
}

/** WhatsApp onde os clientes pedem o link da área do cliente; guardado com o DDI (55…). */
export async function updateCompanyWhatsapp(companyId: string, phone: string | null) {
  let whatsapp: string | null = null;
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) whatsapp = `55${digits}`;
    else if (/^55\d{10,11}$/.test(digits)) whatsapp = digits;
    else throw new UserError('Informe o WhatsApp com DDD, por exemplo (11) 98888-7777.');
  }
  const result = await prisma.company.updateMany({ where: { id: companyId }, data: { whatsapp } });
  if (result.count === 0) throw new UserError('Empresa não encontrada.');
  return whatsapp;
}
