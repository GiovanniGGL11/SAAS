'use server';

import { isCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { getOwnProfessional } from '@/server/auth/professional-scope';
import { listNotices } from '@/server/data/notifications';

export async function listNotificationsAction() {
  const session = await requireCurrentCompany();
  const { company } = session;
  const isAdmin = isCompanyAdmin(session);
  return listNotices(company.id, company.timezone, new Date(), {
    userId: session.userId,
    isAdmin,
    isProfessional: !isAdmin && Boolean(await getOwnProfessional()),
  });
}
