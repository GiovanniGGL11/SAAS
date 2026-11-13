import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { listAllServices } from '@/server/data/services';
import { upgradeOffer } from '@/server/billing/features';
import { serializeService } from '@/lib/serialize';
import { ServiceList, type ServicesTab } from '@/components/servicos/service-list';

const TABS: Record<string, ServicesTab> = {
  pacotes: 'packages',
  assinaturas: 'subscriptions',
};

export default async function ServicosPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { company } = await requireCurrentCompany();
  const { aba } = await searchParams;
  const services = await listAllServices(company.id);

  return (
    <ServiceList
      initialServices={services.map(serializeService)}
      initialTab={(aba && TABS[aba]) || 'services'}
      packagesOffer={upgradeOffer(company, 'packages')}
    />
  );
}
