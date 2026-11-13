import { requireAdminPage } from '@/server/auth/require-current-company';
import { getSubscriptionState } from '@/server/billing/subscription';
import { trialUsageSummary } from '@/server/billing/trial-usage';
import { SubscriptionView } from '@/components/assinatura/subscription-view';

export const metadata = { title: 'Assinatura' };

export default async function AssinaturaPage() {
  const { company } = await requireAdminPage();
  const state = getSubscriptionState(company);
  // No teste: o que já usou do Profissional (e some no Básico).
  const trialUsage =
    state.status === 'TRIAL' && !state.trialPending ? await trialUsageSummary(company.id) : [];
  return (
    <SubscriptionView
      state={{ ...state, hasSubscription: Boolean(company.asaasSubscriptionId) }}
      companyName={company.name}
      trialUsage={trialUsage}
    />
  );
}
