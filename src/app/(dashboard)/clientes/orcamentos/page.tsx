import Link from 'next/link';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { featureBlockedMessage, hasFeature } from '@/server/billing/features';
import { PageHeader } from '@/components/layout/page';
import { QuotesView } from '@/components/orcamentos/quotes-view';

export const metadata = { title: 'Orçamentos' };

/** Orçamentos ficam dentro de Clientes (sem aba própria no menu). */
export default async function OrcamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; novo?: string }>;
}) {
  const { company } = await requireCurrentCompany();
  const { id, novo } = await searchParams;
  const allowed = hasFeature(company, 'quotes');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Orçamentos"
        description="Prepare, envie por link protegido, registre a resposta e converta em pacote."
        actions={
          <Link href="/clientes" className="text-system-blue text-[14px] hover:underline">
            Voltar para clientes
          </Link>
        }
      />
      {allowed ? (
        <QuotesView
          timezone={company.timezone}
          initialOpenId={id?.slice(0, 64)}
          initialNewForClient={novo?.slice(0, 64)}
        />
      ) : (
        <p className="text-label-secondary bg-tile rounded-2xl p-4 text-[14px]">
          {featureBlockedMessage('quotes')}
        </p>
      )}
    </div>
  );
}
