import { cache } from 'react';
import { auth, clerkClient } from '@clerk/nextjs/server';
import type { Company } from '@/generated/prisma/client';
import { getCompanyByClerkOrgId, upsertCompanyFromClerkOrg } from '@/server/data/company';

export class UnauthenticatedError extends Error {
  constructor() {
    super('User is not authenticated.');
    this.name = 'UnauthenticatedError';
  }
}

export class NoActiveOrganizationError extends Error {
  constructor() {
    super('User has no active organization selected.');
    this.name = 'NoActiveOrganizationError';
  }
}

export type CurrentCompanySession = {
  userId: string;
  orgId: string;
  company: Company;
};

async function fetchAndSyncCompanyFromClerk(orgId: string): Promise<Company> {
  const client = await clerkClient();
  const org = await client.organizations.getOrganization({ organizationId: orgId });
  return upsertCompanyFromClerkOrg({ id: org.id, name: org.name, slug: org.slug });
}

async function resolveCompanyForOrg(orgId: string, sessionOrgSlug: string | null | undefined) {
  const existing = await getCompanyByClerkOrgId(orgId);
  if (!existing || existing.deletedAt) {
    // Race condition guard: the user can land on /dashboard before the
    // organization.created webhook has been processed (or been delivered at
    // all, e.g. in local dev without a public URL). Provision the Company
    // on demand using the exact same idempotent upsert the webhook uses, so
    // whichever path runs first "wins" without creating duplicates.
    return fetchAndSyncCompanyFromClerk(orgId);
  }

  // organization.updated webhooks don't reach localhost without a tunnel, so
  // a rename made through Clerk's UI never reaches our DB that way in dev.
  // orgSlug rides free in the session token (no extra Clerk API call), so a
  // mismatch against our stored slug is a cheap signal to refresh from Clerk
  // — self-healing for a missed/delayed webhook in production too. Doesn't
  // catch a name-only edit that keeps the same slug, but that's the rare case.
  if (sessionOrgSlug && sessionOrgSlug !== existing.slug) {
    return fetchAndSyncCompanyFromClerk(orgId);
  }

  return existing;
}

/**
 * Uncached core logic — exported separately so it's testable outside of
 * Next.js's request-scoped React runtime, where React's cache() dispatcher
 * (see requireCurrentCompany below) isn't available/meaningfully reset.
 */
export async function resolveCurrentCompanySession(): Promise<CurrentCompanySession> {
  const { userId, orgId, orgSlug } = await auth();

  if (!userId) {
    throw new UnauthenticatedError();
  }
  if (!orgId) {
    throw new NoActiveOrganizationError();
  }

  const company = await resolveCompanyForOrg(orgId, orgSlug);
  return { userId, orgId, company };
}

/**
 * The single entry point every Server Action, Route Handler and
 * server-rendered page must call before touching tenant data. Resolves the
 * authenticated user + their active Clerk Organization into our internal
 * Company row. Throws instead of silently returning null/undefined so
 * callers can't accidentally proceed without a resolved tenant.
 *
 * Memoized per-request with React's `cache()` — safe to call multiple times
 * (layout + page + nested data calls) without duplicate DB round trips.
 */
export const requireCurrentCompany = cache(resolveCurrentCompanySession);
