import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { FormsHome } from '@/components/fichas/forms-home';

export const metadata = { title: 'Fichas e formulários' };

/** Modelos e preenchimentos. Status é de toda a equipe; respostas, só com permissão. */
export default async function FichasPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { company } = await requireCurrentCompany();
  const { aba } = await searchParams;
  return <FormsHome timezone={company.timezone} initialTab={aba} />;
}
