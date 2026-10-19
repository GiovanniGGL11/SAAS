'use server';

import { isCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { listNotices } from '@/server/data/notifications';

export async function listNotificationsAction() {
  const session = await requireCurrentCompany();
  const { company } = session;
  return listNotices(company.id, company.timezone, new Date(), {
    userId: session.userId,
    isAdmin: isCompanyAdmin(session),
  });
}
