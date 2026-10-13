import { currentUser } from '@clerk/nextjs/server';
import { isCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
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
    "Minha agenda": quem é da equipe (não admin) e tem o mesmo e-mail de um profissional cadastrado
    abre vendo só a própria coluna. Os outros continuam a um clique, na lista de profissionais.
  */
  let myProfessionalId: string | undefined;
  if (!isCompanyAdmin(session)) {
    const user = await currentUser();
    const emails = new Set(user?.emailAddresses.map((e) => e.emailAddress.toLowerCase()) ?? []);
    myProfessionalId = professionals.find((p) => p.email && emails.has(p.email.toLowerCase()))?.id;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* O título visível é o período no topo da agenda, como no Google Agenda. */}
      <h1 className="sr-only">Agenda</h1>
      <AgendaView
        timezone={company.timezone}
        professionals={professionals.map(serializeProfessional)}
        services={services.map(serializeService)}
        clients={clients}
        myProfessionalId={myProfessionalId}
      />
    </div>
  );
}
