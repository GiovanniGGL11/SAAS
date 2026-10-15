import { requireAdminPage } from '@/server/auth/require-current-company';
import { getUnitsOverview } from '@/server/data/units';
import { UnitsView } from '@/components/unidades/units-view';

export const metadata = { title: 'Unidades' };

export default async function UnidadesPage() {
  const { userId, company } = await requireAdminPage();
  const overview = await getUnitsOverview(userId);
  return <UnitsView overview={overview} currentCompanyId={company.id} />;
}
