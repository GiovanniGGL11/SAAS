import { Suspense } from 'react';

import { requireAdminPage } from '@/server/auth/require-current-company';
import { FinanceShell } from '@/components/financeiro/finance-shell';
import { upgradeOffer } from '@/server/billing/features';

export default async function FinanceiroPage() {
  const { company } = await requireAdminPage();
  return (
    <Suspense>
      <FinanceShell commissionsOffer={upgradeOffer(company, 'commissions')} />
    </Suspense>
  );
}
