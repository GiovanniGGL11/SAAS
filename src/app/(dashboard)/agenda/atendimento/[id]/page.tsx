import { notFound } from 'next/navigation';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { getAppointmentOverviewAction } from '@/server/actions/appointment-overview-actions';
import { AppointmentOverviewView } from '@/components/agenda/appointment-overview';

export const metadata = { title: 'Visão do atendimento' };

export default async function AppointmentOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { company } = await requireCurrentCompany();
  const result = await getAppointmentOverviewAction(id);
  if (!result.ok) notFound();
  return (
    <AppointmentOverviewView
      appointmentId={id}
      initialData={result.data}
      timezone={company.timezone}
    />
  );
}
