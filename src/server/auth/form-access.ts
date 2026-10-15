import { cache } from 'react';
import { currentUser } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import {
  isCompanyAdmin,
  requireCurrentCompany,
  type CurrentCompanySession,
} from '@/server/auth/require-current-company';
import {
  professionalIdForEmails,
  resolveFormAccess,
  type FormAccess,
} from '@/server/data/form-permissions';

/**
 * Sessão + o que a pessoa pode fazer nas fichas. O e-mail (para ligar ao profissional) só é
 * buscado no Clerk quando a permissão é "só os meus atendimentos".
 */
export const requireFormAccess = cache(
  async (): Promise<CurrentCompanySession & { access: FormAccess }> => {
    const session = await requireCurrentCompany();
    const grant = await prisma.formPermission.findUnique({
      where: { companyId_userId: { companyId: session.company.id, userId: session.userId } },
    });
    let professionalId: string | null = null;
    if (grant?.scope === 'OWN') {
      const user = await currentUser();
      professionalId = await professionalIdForEmails(
        session.company.id,
        user?.emailAddresses.map((e) => e.emailAddress) ?? [],
      );
    }
    const access = resolveFormAccess({
      userId: session.userId,
      isAdmin: isCompanyAdmin(session),
      grant,
      professionalId,
    });
    return { ...session, access };
  },
);
