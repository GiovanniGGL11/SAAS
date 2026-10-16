import { requireAdminPage } from '@/server/auth/require-current-company';
import { getSubscriptionState } from '@/server/billing/subscription';
import { SubscriptionView } from '@/components/assinatura/subscription-view';

export const metadata = { title: 'Assinatura' };

export default async function AssinaturaPage() {
  const { company } = await requireAdminPage();
  const state = getSubscriptionState(company);
  return (
    <SubscriptionView
      state={{ ...state, hasSubscription: Boolean(company.asaasSubscriptionId) }}
      companyName={company.name}
    />
  );
}
