import { denyProfessionalPage } from '@/server/auth/professional-scope';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { ProfessionalsTutorial } from '@/components/tutorial/professionals-tutorial';

export const metadata = { title: 'Como usar Profissionais' };

/** Tutorial de Profissionais (mesmo acesso da tela). */
export default async function ProfessionalsTutorialPage() {
  await denyProfessionalPage();
  await requireCurrentCompany();
  return <ProfessionalsTutorial />;
}
