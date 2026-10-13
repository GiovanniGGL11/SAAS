import { requireAdminPage } from '@/server/auth/require-current-company';
import { getReportAction } from '@/server/actions/report-actions';
import { ReportView } from '@/components/relatorios/report-view';

export default async function RelatoriosPage() {
  await requireAdminPage();
  const initialData = await getReportAction({ preset: 'last30' });

  return <ReportView initialData={initialData} />;
}
