import { denyProfessionalPage } from '@/server/auth/professional-scope';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { CashRegisterView } from '@/components/caixa/cash-register-view';

export const metadata = { title: 'Caixa' };

export default async function CaixaPage() {
  // Profissional logado não abre esta tela (vê só a agenda, os clientes e os ganhos dele).
  await denyProfessionalPage();
  const { company } = await requireCurrentCompany();
  return <CashRegisterView timezone={company.timezone} />;
}
