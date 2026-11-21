'use server';

import { getViewerScope } from '@/server/auth/professional-scope';
import { isCompanyAdmin } from '@/server/auth/require-current-company';
import { listNotices } from '@/server/data/notifications';

export async function listNotificationsAction() {
  // Login do profissional: avisos só da própria agenda (mesma regra das telas).
  const { session, professional } = await getViewerScope();
  const { company } = session;
  return listNotices(company.id, company.timezone, new Date(), {
    userId: session.userId,
    isAdmin: isCompanyAdmin(session),
    professionalId: professional?.id ?? null,
  });
}
