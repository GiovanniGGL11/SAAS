import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { listActiveProfessionals } from '@/server/data/professionals';
import { listActiveServices } from '@/server/data/services';
import { listActiveClients } from '@/server/data/clients';
import { AgendaView } from '@/components/agenda/agenda-view';
import { serializeService } from '@/lib/serialize';

export default async function AgendaPage() {
  const { company } = await requireCurrentCompany();

  const [professionals, services, clients] = await Promise.all([
    listActiveProfessionals(company.id),
    listActiveServices(company.id),
    listActiveClients(company.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
        <p className="text-muted-foreground text-sm">
          Arraste para reagendar, clique para ver detalhes ou alterar o status.
        </p>
      </div>
      <AgendaView
        timezone={company.timezone}
        professionals={professionals}
        services={services.map(serializeService)}
        clients={clients}
      />
    </div>
  );
}
