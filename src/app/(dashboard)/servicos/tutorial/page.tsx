import { denyProfessionalPage } from '@/server/auth/professional-scope';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { ServicesTutorial } from '@/components/tutorial/services-tutorial';

export const metadata = { title: 'Como usar os Serviços' };

/** Tutorial dos Serviços, pacotes e assinaturas (mesmo acesso dos Serviços). */
export default async function ServicesTutorialPage() {
  await denyProfessionalPage();
  await requireCurrentCompany();
  return <ServicesTutorial />;
}
