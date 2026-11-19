import { requireAdminPage } from '@/server/auth/require-current-company';
import { FinanceTutorial } from '@/components/financeiro/finance-tutorial';

export const metadata = { title: 'Como usar a Precificação e o Lucro' };

/** Tutorial do Financeiro (mesmo acesso do Financeiro: dono e administradores). */
export default async function FinanceTutorialPage() {
  await requireAdminPage();
  return <FinanceTutorial />;
}
