import { denyProfessionalPage } from '@/server/auth/professional-scope';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { CommercialTutorial } from '@/components/tutorial/commercial-tutorial';

export const metadata = { title: 'Como usar o Comercial' };

/** Tutorial do Comercial (mesmo acesso do Comercial). */
export default async function CommercialTutorialPage() {
  await denyProfessionalPage();
  await requireCurrentCompany();
  return <CommercialTutorial />;
}
