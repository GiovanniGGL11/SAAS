import { isCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { featureBlockedMessage, hasFeature } from '@/server/billing/features';
import { PageHeader } from '@/components/layout/page';
import { CommercialShell } from '@/components/comercial/commercial-shell';

export const metadata = { title: 'Comercial' };

export default async function ComercialPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; id?: string; novo?: string; oportunidade?: string }>;
}) {
  const session = await requireCurrentCompany();
  const { company } = session;
  const params = await searchParams;
  const crm = hasFeature(company, 'crm');
  const quotes = hasFeature(company, 'quotes');
  if (!crm && !quotes) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Comercial" />
        <p className="bg-tile text-label-secondary rounded-2xl p-4 text-[14px]">
          {featureBlockedMessage('crm')}
        </p>
      </div>
    );
  }
  const wantsQuotes =
    params.aba === 'orcamentos' ||
    Boolean(params.novo) ||
    (Boolean(params.id) && params.aba !== 'oportunidades');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Comercial" description="Oportunidades em andamento e orçamentos." />
      <CommercialShell
        timezone={company.timezone}
        isAdmin={isCompanyAdmin(session)}
        crm={crm}
        quotes={quotes}
        initialTab={crm && !wantsQuotes ? 'oportunidades' : 'orcamentos'}
        quoteId={params.aba === 'orcamentos' || !crm ? params.id?.slice(0, 64) : undefined}
        newQuoteFor={params.novo?.slice(0, 64)}
        opportunityId={params.oportunidade?.slice(0, 64)}
      />
    </div>
  );
}
