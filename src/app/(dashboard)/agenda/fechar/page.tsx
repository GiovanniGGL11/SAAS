import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { listAppointmentsToClose } from '@/server/data/to-close';
import { ToCloseView } from '@/components/agenda/to-close-view';

export const metadata = { title: 'Atendimentos para fechar' };
export const dynamic = 'force-dynamic';

/** Horários que já passaram e não foram concluídos nem marcados como falta. */
export default async function FecharPage() {
  const { company } = await requireCurrentCompany();
  const items = await listAppointmentsToClose(company.id);
  return <ToCloseView items={items} timezone={company.timezone} />;
}
