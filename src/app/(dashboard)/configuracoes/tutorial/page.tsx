import { requireAdminPage } from '@/server/auth/require-current-company';
import { SettingsTutorial } from '@/components/tutorial/settings-tutorial';

export const metadata = { title: 'Como usar as Configurações' };

/** Tutorial das Configurações (mesmo acesso: dono e administradores). */
export default async function SettingsTutorialPage() {
  await requireAdminPage();
  return <SettingsTutorial />;
}
