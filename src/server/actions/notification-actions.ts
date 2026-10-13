'use server';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { listNotices } from '@/server/data/notifications';

export async function listNotificationsAction() {
  const { company } = await requireCurrentCompany();
  return listNotices(company.id, company.timezone);
}
