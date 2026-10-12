import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { listActiveProfessionals } from '@/server/data/professionals';
import { listActiveServices } from '@/server/data/services';
import { listActiveClients } from '@/server/data/clients';
import { AgendaView } from '@/components/agenda/agenda-view';
import { serializeProfessional, serializeService } from '@/lib/serialize';

export default async function AgendaPage() {
  const { company } = await requireCurrentCompany();

  const [professionals, services, clients] = await Promise.all([
    listActiveProfessionals(company.id),
    listActiveServices(company.id),
    listActiveClients(company.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {/* O título visível é o período no topo da agenda, como no Google Agenda. */}
      <h1 className="sr-only">Agenda</h1>
      <AgendaView
        timezone={company.timezone}
        professionals={professionals.map(serializeProfessional)}
        services={services.map(serializeService)}
        clients={clients}
      />
    </div>
  );
}
