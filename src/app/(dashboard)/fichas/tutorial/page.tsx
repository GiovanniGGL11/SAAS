import { denyProfessionalPage } from '@/server/auth/professional-scope';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { FormsTutorial } from '@/components/tutorial/forms-tutorial';

export const metadata = { title: 'Como usar as Fichas' };

/** Tutorial das Fichas (mesmo acesso das Fichas; aberto também no plano sem fichas). */
export default async function FormsTutorialPage() {
  await denyProfessionalPage();
  await requireCurrentCompany();
  return <FormsTutorial />;
}
