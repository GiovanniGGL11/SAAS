import { denyProfessionalPage } from '@/server/auth/professional-scope';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { StockTutorial } from '@/components/tutorial/stock-tutorial';

export const metadata = { title: 'Como usar o Estoque' };

/** Tutorial do Estoque (mesmo acesso do Estoque). */
export default async function StockTutorialPage() {
  await denyProfessionalPage();
  await requireCurrentCompany();
  return <StockTutorial />;
}
