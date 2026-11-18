import { requireAdminPage } from '@/server/auth/require-current-company';
import { CampaignsTutorial } from '@/components/tutorial/campaigns-tutorial';

export const metadata = { title: 'Como usar Cupons e campanhas' };

/** Tutorial de Cupons e campanhas (mesmo acesso da tela: dono e administradores). */
export default async function CampaignsTutorialPage() {
  await requireAdminPage();
  return <CampaignsTutorial />;
}
