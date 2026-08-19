import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { listAllServices } from '@/server/data/services';
import { serializeService } from '@/lib/serialize';
import { ServiceList } from '@/components/servicos/service-list';

export default async function ServicosPage() {
  const { company } = await requireCurrentCompany();
  const services = await listAllServices(company.id);

  return <ServiceList initialServices={services.map(serializeService)} />;
}
