import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { AgendaTutorial } from '@/components/tutorial/agenda-tutorial';

export const metadata = { title: 'Como usar a Agenda' };

/** Tutorial da Agenda (todos que usam a agenda, inclusive a equipe). */
export default async function AgendaTutorialPage() {
  await requireCurrentCompany();
  return <AgendaTutorial />;
}
