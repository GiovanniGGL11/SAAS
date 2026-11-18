import { notFound, redirect } from 'next/navigation';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { canSeeClient } from '@/server/auth/professional-scope';
import { hasFeature } from '@/server/billing/features';
import { medicalRecordsEnabled } from '@/lib/medical-records';
import { MedicalRecordView } from '@/components/prontuario/medical-record-view';

export const metadata = { title: 'Prontuário' };

/** Prontuário do paciente (ramos de saúde, estética e odonto, ou ligado em Configurações). */
export default async function ProntuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { company } = await requireCurrentCompany();
  if (!medicalRecordsEnabled(company)) redirect(`/clientes/${id}`);
  if (!(await canSeeClient(id))) notFound();
  return (
    <MedicalRecordView
      clientId={id}
      timezone={company.timezone}
      formsEnabled={hasFeature(company, 'forms')}
    />
  );
}
