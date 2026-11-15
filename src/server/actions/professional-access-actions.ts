'use server';

import { clerkClient } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import { siteUrl } from '@/lib/site-url';
import { toActionResult } from '@/server/action-result';
import { UserError, parseId } from '@/server/errors';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';

/*
  Acesso do próprio profissional: o dono envia um convite para o e-mail do cadastro. Quem aceita
  entra como equipe (org:member) e, ligado ao profissional pelo e-mail, vê só a agenda, os
  clientes e os ganhos dele.
*/

export type ProfessionalAccess =
  | { status: 'no_email' }
  | { status: 'none'; email: string }
  | { status: 'invited'; email: string; invitationId: string; sentAt: number }
  | { status: 'active'; email: string | null };

async function loadProfessional(companyId: string, id: string) {
  const professional = await prisma.professional.findFirst({
    where: { id, companyId },
    select: { id: true, email: true, userId: true },
  });
  if (!professional) throw new UserError('Profissional não encontrado.');
  return professional;
}

async function accessFor(
  orgId: string,
  professional: { email: string | null; userId: string | null },
): Promise<ProfessionalAccess> {
  if (professional.userId) return { status: 'active', email: professional.email };
  if (!professional.email) return { status: 'no_email' };
  const email = professional.email.toLowerCase();
  const client = await clerkClient();
  const [members, invitations] = await Promise.all([
    client.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 100 }),
    client.organizations.getOrganizationInvitationList({
      organizationId: orgId,
      status: ['pending'],
      limit: 100,
    }),
  ]);
  if (members.data.some((m) => m.publicUserData?.identifier?.toLowerCase() === email)) {
    // Já é da equipe; a ligação com o profissional acontece no primeiro acesso.
    return { status: 'active', email: professional.email };
  }
  const invitation = invitations.data.find((i) => i.emailAddress.toLowerCase() === email);
  if (invitation) {
    return {
      status: 'invited',
      email: professional.email,
      invitationId: invitation.id,
      sentAt: invitation.createdAt,
    };
  }
  return { status: 'none', email: professional.email };
}

export async function getProfessionalAccessAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { orgId, company } = await requireCompanyAdmin();
    return accessFor(orgId, await loadProfessional(company.id, id));
  });
}

/** Máximo de pessoas por empresa no plano grátis do Clerk. */
const MEMBER_LIMIT = 20;

/**
 * Empresas criadas antes de o limite padrão subir no Clerk ficaram com 5 pessoas: sobe para 20 na
 * hora de convidar, sem ninguém precisar ajustar no painel do Clerk.
 */
async function ensureMemberLimit(orgId: string) {
  try {
    const client = await clerkClient();
    const org = await client.organizations.getOrganization({ organizationId: orgId });
    if (org.maxAllowedMemberships !== 0 && org.maxAllowedMemberships < MEMBER_LIMIT) {
      await client.organizations.updateOrganization(orgId, {
        maxAllowedMemberships: MEMBER_LIMIT,
      });
    }
  } catch (error) {
    console.error('[convite] não foi possível ajustar o limite de membros', error);
  }
}

/** Envia (ou reenvia) o convite para o e-mail do profissional. */
export async function inviteProfessionalAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { orgId, userId, company } = await requireCompanyAdmin();
    const professional = await loadProfessional(company.id, id);
    if (!professional.email) {
      throw new UserError('Cadastre o e-mail do profissional para enviar o convite.');
    }
    const current = await accessFor(orgId, professional);
    if (current.status === 'active') throw new UserError('Este profissional já tem acesso.');
    const client = await clerkClient();
    await ensureMemberLimit(orgId);
    if (current.status === 'invited') {
      // Reenviar = cancelar o convite anterior e mandar um novo (o link antigo deixa de valer).
      await client.organizations.revokeOrganizationInvitation({
        organizationId: orgId,
        invitationId: current.invitationId,
        requestingUserId: userId,
      });
    }
    try {
      await client.organizations.createOrganizationInvitation({
        organizationId: orgId,
        emailAddress: professional.email,
        role: 'org:member',
        inviterUserId: userId,
        redirectUrl: `${siteUrl()}/convite?org=${encodeURIComponent(orgId)}`,
      });
    } catch (error) {
      const text = JSON.stringify(error ?? '').toLowerCase();
      if (text.includes('limit') || text.includes('membership_quota')) {
        throw new UserError(
          'A empresa chegou ao limite de pessoas com acesso. Fale com o suporte do Atendafy.',
        );
      }
      if (text.includes('already') && text.includes('member')) {
        throw new UserError('Este e-mail já tem acesso à empresa.');
      }
      throw new UserError('Não foi possível enviar o convite agora. Tente de novo.');
    }
    return accessFor(orgId, professional);
  });
}

/** Tira o acesso: cancela o convite pendente ou remove a pessoa da equipe. */
export async function revokeProfessionalAccessAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { orgId, userId, company } = await requireCompanyAdmin();
    const professional = await loadProfessional(company.id, id);
    const client = await clerkClient();
    const current = await accessFor(orgId, professional);
    if (current.status === 'invited') {
      await client.organizations.revokeOrganizationInvitation({
        organizationId: orgId,
        invitationId: current.invitationId,
        requestingUserId: userId,
      });
    } else if (current.status === 'active') {
      let memberId = professional.userId;
      if (!memberId && professional.email) {
        const members = await client.organizations.getOrganizationMembershipList({
          organizationId: orgId,
          limit: 100,
        });
        memberId =
          members.data.find(
            (m) =>
              m.publicUserData?.identifier?.toLowerCase() === professional.email!.toLowerCase(),
          )?.publicUserData?.userId ?? null;
      }
      if (memberId === userId) throw new UserError('Você não pode tirar o seu próprio acesso.');
      if (memberId) {
        await client.organizations
          .deleteOrganizationMembership({ organizationId: orgId, userId: memberId })
          .catch(() => undefined);
      }
      await prisma.professional.update({ where: { id: professional.id }, data: { userId: null } });
    }
    return accessFor(orgId, { ...professional, userId: null });
  });
}
