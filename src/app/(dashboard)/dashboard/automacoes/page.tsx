import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { PageHeader } from '@/components/layout/page';
import { AutomationsView } from '@/components/automacoes/automations-view';

export const metadata = { title: 'Ações automáticas' };

export default async function AutomacoesPage() {
  await requireCurrentCompany();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Ações automáticas"
        description="Rotinas que agem sozinhas só dentro do que você autorizou. Pausa, histórico e resultados."
      />
      <AutomationsView />
    </div>
  );
}
