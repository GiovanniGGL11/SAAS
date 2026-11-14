import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { FormsHome } from '@/components/fichas/forms-home';
import { upgradeOffer } from '@/server/billing/features';
import { UpgradeCard } from '@/components/assinatura/upgrade-card';
import { PageHeader } from '@/components/layout/page';

export const metadata = { title: 'Fichas e formulários' };

/** Modelos e preenchimentos. Status é de toda a equipe; respostas, só com permissão. */
export default async function FichasPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { company } = await requireCurrentCompany();
  const { aba } = await searchParams;
  const offer = upgradeOffer(company, 'forms');
  if (offer) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Fichas e formulários" />
        <UpgradeCard offer={offer} />
      </div>
    );
  }
  return <FormsHome timezone={company.timezone} initialTab={aba} />;
}
