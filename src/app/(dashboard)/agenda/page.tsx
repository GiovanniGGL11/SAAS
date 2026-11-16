import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { getOwnProfessional } from '@/server/auth/professional-scope';
import { listActiveProfessionals } from '@/server/data/professionals';
import { listActiveServices } from '@/server/data/services';
import { listActiveClients } from '@/server/data/clients';
import { AgendaView } from '@/components/agenda/agenda-view';
import { serializeProfessional, serializeService } from '@/lib/serialize';

export default async function AgendaPage() {
  const session = await requireCurrentCompany();
  const { company } = session;

  const [professionals, services, clients] = await Promise.all([
    listActiveProfessionals(company.id),
    listActiveServices(company.id),
    listActiveClients(company.id),
  ]);

  /*
    "Minha agenda": o profissional que entra com o próprio login vê só a coluna dele (o servidor
    também só devolve os agendamentos dele). A recepção (equipe sem cadastro de profissional)
    continua vendo todos.
  */
  const own = await getOwnProfessional();
  const visibleProfessionals = own ? professionals.filter((p) => p.id === own.id) : professionals;

  return (
    <div className="flex flex-col gap-4">
      {/* O título visível é o período no topo da agenda, como no Google Agenda. */}
      <h1 className="sr-only">Agenda</h1>
      <AgendaView
        timezone={company.timezone}
        professionals={visibleProfessionals.map(serializeProfessional)}
        services={services.map(serializeService)}
        clients={clients}
        myProfessionalId={own?.id}
      />
    </div>
  );
}
