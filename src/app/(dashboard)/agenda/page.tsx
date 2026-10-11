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
      <div>
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em] md:text-[34px]">
          Agenda
        </h1>
        <p className="text-label-secondary mt-1 text-[15px]">
          Arraste para reagendar, clique para ver detalhes ou alterar o status.
        </p>
      </div>
      <AgendaView
        timezone={company.timezone}
        professionals={professionals.map(serializeProfessional)}
        services={services.map(serializeService)}
        clients={clients}
      />
    </div>
  );
}
