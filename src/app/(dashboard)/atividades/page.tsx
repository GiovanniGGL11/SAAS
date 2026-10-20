import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { PageHeader } from '@/components/layout/page';
import { ActivitiesShell } from '@/components/atividades/activities-shell';

export const metadata = { title: 'Atividades' };

export default async function AtividadesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; tarefa?: string }>;
}) {
  const { company } = await requireCurrentCompany();
  const { aba, tarefa } = await searchParams;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Atividades" description="O seu dia e as tarefas da equipe." />
      <ActivitiesShell
        timezone={company.timezone}
        initialTab={aba === 'tarefas' || tarefa ? 'tarefas' : 'meu-dia'}
        initialTaskId={tarefa?.slice(0, 64)}
      />
    </div>
  );
}
