import { Suspense } from 'react';

import { requireAdminPage } from '@/server/auth/require-current-company';
import { FinanceShell } from '@/components/financeiro/finance-shell';

export default async function FinanceiroPage() {
  await requireAdminPage();
  return (
    <Suspense>
      <FinanceShell />
    </Suspense>
  );
}
