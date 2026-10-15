'use server';

import { randomBytes } from 'node:crypto';
import { clerkClient } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { softDeleteCompanyByClerkOrgId, upsertCompanyFromClerkOrg } from '@/server/data/company';
import { seedDemoCompany } from '@/server/data/demo';
import { UserError } from '@/server/errors';
import { rateLimit } from '@/server/rate-limit';

const DEMO_NAME = 'Demonstração Atendafy';

/** Organizações do usuário no Clerk, separando a demonstração das empresas reais. */
async function userOrganizations(userId: string) {
  const client = await clerkClient();
  const { data } = await client.users.getOrganizationMembershipList({ userId, limit: 100 });
  const orgs = data.map((m) => m.organization);
  return {
    demo: orgs.find((o) => o.publicMetadata?.demo === true) ?? null,
    real: orgs.filter((o) => o.publicMetadata?.demo !== true),
  };
}

/**
 * Cria (ou reabre) a empresa de demonstração do usuário: uma organização à parte, com dados
 * fictícios. Nada é gravado na empresa real. Uma demonstração por pessoa.
 */
export async function openDemoCompanyAction() {
  return toActionResult(async () => {
    const { userId } = await requireCompanyAdmin();
    await rateLimit('demo', 3, 10 * 60_000);

    const { demo: existing } = await userOrganizations(userId);
    const org =
      existing ??
      (await (
        await clerkClient()
      ).organizations.createOrganization({
        name: DEMO_NAME,
        slug: `demonstracao-${randomBytes(4).toString('hex')}`,
        createdBy: userId,
        // Fica fora do agendamento online: ninguém de fora reserva na demonstração.
        publicMetadata: { demo: true, onlineBooking: false },
      }));

    const company = await upsertCompanyFromClerkOrg({ id: org.id, name: org.name, slug: org.slug });
    await prisma.company.update({ where: { id: company.id }, data: { isDemo: true } });
    // Reabrir uma demonstração vazia (criação interrompida no meio) preenche de novo.
    if ((await prisma.service.count({ where: { companyId: company.id } })) === 0) {
      await seedDemoCompany(company.id, company.timezone);
    }
    return { organizationId: org.id };
  });
}

/**
 * Sai da demonstração para a primeira empresa real do usuário; com `remove`, exclui a
 * demonstração (só ela: a empresa precisa estar marcada como demonstração).
 */
export async function leaveDemoCompanyAction(input: { remove?: boolean } = {}) {
  return toActionResult(async () => {
    const session = input.remove ? await requireCompanyAdmin() : await requireCurrentCompany();
    const { company, userId } = session;
    if (!company.isDemo) throw new UserError('Você não está na empresa de demonstração.');

    const { real } = await userOrganizations(userId);
    if (input.remove) {
      await (await clerkClient()).organizations.deleteOrganization(company.clerkOrgId);
      await softDeleteCompanyByClerkOrgId(company.clerkOrgId);
    }
    return { organizationId: real[0]?.id ?? null };
  });
}
