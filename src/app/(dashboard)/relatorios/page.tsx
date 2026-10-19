import { requireAdminPage } from '@/server/auth/require-current-company';
import { getReportAction } from '@/server/actions/report-actions';
import { hasFeature } from '@/server/billing/features';
import { ReportView } from '@/components/relatorios/report-view';
import { ServiceMarginsCard } from '@/components/relatorios/service-margins-card';

export default async function RelatoriosPage() {
  const { company } = await requireAdminPage();
  const initialData = await getReportAction({ preset: 'last30' });

  return (
    <div className="flex flex-col gap-5">
      <ReportView initialData={initialData} />
      {hasFeature(company, 'contributionMargin') && <ServiceMarginsCard />}
    </div>
  );
}
