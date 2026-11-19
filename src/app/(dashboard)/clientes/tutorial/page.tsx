import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { ClientsTutorial } from '@/components/tutorial/clients-tutorial';

export const metadata = { title: 'Como usar os Clientes' };

/** Tutorial dos Clientes (mesmo acesso da lista de clientes, inclusive para a equipe). */
export default async function ClientsTutorialPage() {
  await requireCurrentCompany();
  return <ClientsTutorial />;
}
