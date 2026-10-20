import { cache } from 'react';
import { clerkClient } from '@clerk/nextjs/server';

export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
};

/** Pessoas da organização (Clerk). Uma busca por requisição. */
export const listTeamMembers = cache(async (clerkOrgId: string): Promise<TeamMember[]> => {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({
    organizationId: clerkOrgId,
    limit: 100,
  });
  return data
    .filter((m) => m.publicUserData?.userId)
    .map((m) => ({
      userId: m.publicUserData!.userId,
      name:
        [m.publicUserData!.firstName, m.publicUserData!.lastName].filter(Boolean).join(' ') ||
        m.publicUserData!.identifier,
      email: m.publicUserData!.identifier,
      role: m.role === 'org:admin' ? ('admin' as const) : ('member' as const),
    }));
});

/** Confere que o usuário é da organização (responsável de tarefa, dono de oportunidade). */
export async function assertTeamMember(clerkOrgId: string, userId: string) {
  const members = await listTeamMembers(clerkOrgId);
  return members.some((m) => m.userId === userId);
}
