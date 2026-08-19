import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { listClients } from '@/server/data/clients';
import { ClientList } from '@/components/clientes/client-list';

export default async function ClientesPage() {
  const { company } = await requireCurrentCompany();
  const clients = await listClients(company.id);

  return <ClientList initialClients={clients} />;
}
