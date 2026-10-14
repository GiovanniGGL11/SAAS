import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { listClients, listLapsedClients } from '@/server/data/clients';
import { ClientList, type ClientFilter } from '@/components/clientes/client-list';

const FILTERS: ClientFilter[] = ['active', 'vip', 'lapsed', 'birthdays', 'new', 'archived', 'all'];
// Endereços em português vindos do dashboard (?filtro=sumidos).
const ALIASES: Record<string, ClientFilter> = {
  sumidos: 'lapsed',
  aniversariantes: 'birthdays',
  novos: 'new',
};

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const { company } = await requireCurrentCompany();
  const [clients, lapsed, { filtro }] = await Promise.all([
    listClients(company.id),
    listLapsedClients(company.id, 60, 5000),
    searchParams,
  ]);
  const raw = filtro ? (ALIASES[filtro] ?? filtro) : 'active';
  const initialFilter = FILTERS.includes(raw as ClientFilter) ? (raw as ClientFilter) : 'active';

  return (
    <ClientList
      initialClients={clients}
      lapsedIds={lapsed.map((c) => c.id)}
      initialFilter={initialFilter}
      timezone={company.timezone}
    />
  );
}
