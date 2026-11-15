import { cache } from 'react';
import { currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { UserError } from '@/server/errors';
import {
  isCompanyAdmin,
  requireCurrentCompany,
  type CurrentCompanySession,
} from '@/server/auth/require-current-company';

/*
  Login do próprio profissional. Quem é da equipe (não admin) e tem conta ligada a um profissional
  vê só o que é dele: a própria agenda, os clientes que atende e os próprios ganhos.

  A ligação é feita uma vez: no primeiro acesso, a conta é casada com o profissional pelo e-mail
  do cadastro (o mesmo do convite) e fica gravada em Professional.userId. Daí em diante a busca é
  direta, sem consultar o Clerk a cada página.
*/

export type OwnProfessional = { id: string; name: string; color: string };

type Scope = { session: CurrentCompanySession; professional: OwnProfessional | null };

async function resolveScope(): Promise<Scope> {
  const session = await requireCurrentCompany();
  if (isCompanyAdmin(session)) return { session, professional: null };
  const { company, userId } = session;
  const select = { id: true, name: true, color: true } as const;

  const linked = await prisma.professional.findFirst({
    where: { companyId: company.id, userId, active: true },
    select,
  });
  if (linked) return { session, professional: linked };

  // Primeiro acesso: casa pelo e-mail (só e-mails verificados da conta) e grava a ligação.
  const user = await currentUser();
  const emails = (user?.emailAddresses ?? [])
    .filter((e) => e.verification?.status === 'verified')
    .map((e) => e.emailAddress.toLowerCase());
  if (emails.length === 0) return { session, professional: null };
  const candidates = await prisma.professional.findMany({
    where: { companyId: company.id, active: true, userId: null, email: { not: null } },
    select: { ...select, email: true },
  });
  const match = candidates.find((p) => p.email && emails.includes(p.email.toLowerCase()));
  if (!match) return { session, professional: null };
  await prisma.professional
    .updateMany({ where: { id: match.id, userId: null }, data: { userId } })
    .catch(() => undefined);
  return { session, professional: { id: match.id, name: match.name, color: match.color } };
}

/** Sessão + profissional da pessoa logada (null para dono/gerente e recepção sem cadastro). */
export const getViewerScope = cache(resolveScope);

/** Profissional da pessoa logada, quando ela entra como profissional. */
export async function getOwnProfessional(): Promise<OwnProfessional | null> {
  return (await getViewerScope()).professional;
}

/** Página que não é do profissional (caixa, estoque, cadastros...): ele volta para a agenda. */
export async function denyProfessionalPage(): Promise<void> {
  if (await getOwnProfessional()) redirect('/agenda');
}

/** Ação de dados que o profissional não pode fazer (ex.: mexer na agenda de um colega). */
export async function assertOwnProfessionalId(professionalId: string | null | undefined) {
  const own = await getOwnProfessional();
  if (own && professionalId !== own.id) {
    throw new UserError('Você só pode mexer na sua própria agenda.');
  }
}

/** Agendamento existente: o profissional só mexe nos dele. */
export async function assertOwnAppointment(appointmentId: string) {
  const scope = await getViewerScope();
  if (!scope.professional) return;
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, companyId: scope.session.company.id },
    select: { professionalId: true },
  });
  if (appointment && appointment.professionalId !== scope.professional.id) {
    throw new UserError('Este agendamento é de outro profissional.');
  }
}

/** Cliente: o profissional só vê quem já atendeu ou tem horário com ele. */
export async function canSeeClient(clientId: string): Promise<boolean> {
  const scope = await getViewerScope();
  if (!scope.professional) return true;
  const count = await prisma.appointment.count({
    where: {
      companyId: scope.session.company.id,
      clientId,
      professionalId: scope.professional.id,
    },
  });
  return count > 0;
}
