import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { CashRegisterView } from '@/components/caixa/cash-register-view';

export const metadata = { title: 'Caixa' };

export default async function CaixaPage() {
  const { company } = await requireCurrentCompany();
  return <CashRegisterView timezone={company.timezone} />;
}
