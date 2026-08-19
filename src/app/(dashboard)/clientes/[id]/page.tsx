import { notFound } from 'next/navigation';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { getClientDetailAction } from '@/server/actions/client-actions';

import { ClientDetail } from '@/components/clientes/client-detail';

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { company } = await requireCurrentCompany();

  const data = await getClientDetailAction(id);
  if (!data) notFound();

  return <ClientDetail clientId={id} timezone={company.timezone} initialData={data} />;
}
