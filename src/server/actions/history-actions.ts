'use server';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { listAuditHistory } from '@/server/data/audit-history';
import { parseId } from '@/server/errors';

/** Histórico de um agendamento (quem criou, mudou o horário, cobrou, cancelou), para a equipe. */
export async function getAppointmentHistoryAction(rawId: unknown) {
  const id = parseId(rawId);
  const { company } = await requireCurrentCompany();
  const { entries } = await listAuditHistory(company.id, company.timezone, {
    since: new Date(0),
    entityType: 'Appointment',
    entityId: id,
    limit: 100,
  });
  return entries;
}
