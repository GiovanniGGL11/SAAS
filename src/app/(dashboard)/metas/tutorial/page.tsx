import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { GoalsTutorial } from '@/components/tutorial/goals-tutorial';

export const metadata = { title: 'Como usar as Metas' };

/** Tutorial das Metas (mesmo acesso das Metas, inclusive para a equipe). */
export default async function GoalsTutorialPage() {
  await requireCurrentCompany();
  return <GoalsTutorial />;
}
