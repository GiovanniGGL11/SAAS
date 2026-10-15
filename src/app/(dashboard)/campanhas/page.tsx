import { Suspense } from 'react';

import { requireAdminPage } from '@/server/auth/require-current-company';
import { listAllCoupons } from '@/server/data/coupons';
import { serializeCoupon } from '@/lib/serialize';
import { CampaignsShell } from '@/components/campanhas/campaigns-shell';

export const metadata = { title: 'Marketing' };

export default async function CampanhasPage() {
  const { company } = await requireAdminPage();
  const coupons = await listAllCoupons(company.id);

  return (
    <Suspense>
      <CampaignsShell coupons={coupons.map(serializeCoupon)} />
    </Suspense>
  );
}
