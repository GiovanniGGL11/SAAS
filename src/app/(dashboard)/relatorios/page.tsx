import { requireAdminPage } from '@/server/auth/require-current-company';
import { getReportAction } from '@/server/actions/report-actions';
import { hasFeature, upgradeOffer } from '@/server/billing/features';
import { UpgradeCard } from '@/components/assinatura/upgrade-card';
import { PageHeader } from '@/components/layout/page';
import { ReportView } from '@/components/relatorios/report-view';
import { ServiceMarginsCard } from '@/components/relatorios/service-margins-card';
import { AdvancedKpis } from '@/components/relatorios/advanced-kpis';
import { PeriodGoals } from '@/components/relatorios/period-goals';

export default async function RelatoriosPage() {
  const { company } = await requireAdminPage();
  const offer = upgradeOffer(company, 'reports');
  if (offer) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Relatórios" />
        <UpgradeCard offer={offer} />
      </div>
    );
  }
  const initialData = await getReportAction({ preset: 'last30' });

  return (
    <div className="flex flex-col gap-5">
      <ReportView initialData={initialData} />
      {hasFeature(company, 'advancedKpis') && <PeriodGoals />}
      {hasFeature(company, 'advancedKpis') && <AdvancedKpis />}
      {hasFeature(company, 'contributionMargin') && <ServiceMarginsCard />}
    </div>
  );
}
