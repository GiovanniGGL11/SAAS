import { requireAdminPage } from '@/server/auth/require-current-company';
import { getUnitsOverview } from '@/server/data/units';
import { UnitsView } from '@/components/unidades/units-view';
import { upgradeOffer } from '@/server/billing/features';
import { UpgradeCard } from '@/components/assinatura/upgrade-card';
import { PageHeader } from '@/components/layout/page';

export const metadata = { title: 'Unidades' };

export default async function UnidadesPage() {
  const { userId, company } = await requireAdminPage();
  const offer = upgradeOffer(company, 'multiUnit');
  if (offer) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Unidades" />
        <UpgradeCard offer={offer} />
      </div>
    );
  }
  const overview = await getUnitsOverview(userId);
  return <UnitsView overview={overview} currentCompanyId={company.id} />;
}
