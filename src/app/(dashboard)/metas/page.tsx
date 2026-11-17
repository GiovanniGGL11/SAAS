import { getViewerScope } from '@/server/auth/professional-scope';
import { isCompanyAdmin } from '@/server/auth/require-current-company';
import { getGoalsOverview } from '@/server/data/goals';
import { GoalsView } from '@/components/metas/goals-view';

export const metadata = { title: 'Metas' };

/**
 * Metas do mês. O dono vê e define as metas da empresa e de cada profissional; o profissional vê a
 * meta dele (e a da empresa, se o dono liberar); a recepção vê a da empresa, se liberada.
 */
export default async function MetasPage() {
  const { session, professional } = await getViewerScope();
  const isAdmin = isCompanyAdmin(session);
  const { company } = session;
  const data = await getGoalsOverview(company, {
    includeCompany: isAdmin || company.shareGoalsWithTeam,
    onlyProfessionalId: isAdmin ? null : (professional?.id ?? '__ninguem__'),
  });
  return <GoalsView data={data} isAdmin={isAdmin} ownProfessionalId={professional?.id ?? null} />;
}
