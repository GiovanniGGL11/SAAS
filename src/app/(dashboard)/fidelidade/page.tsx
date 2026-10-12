import { requireAdminPage } from '@/server/auth/require-current-company';
import { listActiveServices } from '@/server/data/services';
import { getLoyaltyOverviewAction } from '@/server/actions/loyalty-actions';
import { serializeService } from '@/lib/serialize';
import { LoyaltyView } from '@/components/fidelidade/loyalty-view';

export default async function FidelidadePage() {
  const { company } = await requireAdminPage();
  const [overview, services] = await Promise.all([
    getLoyaltyOverviewAction(),
    listActiveServices(company.id),
  ]);

  return <LoyaltyView initialData={overview} services={services.map(serializeService)} />;
}
