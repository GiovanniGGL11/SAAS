import { requireAdminPage } from '@/server/auth/require-current-company';
import { FinanceView } from '@/components/financeiro/finance-view';

export default async function FinanceiroPage() {
  await requireAdminPage();
  return <FinanceView />;
}
