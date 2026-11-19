import { requireAdminPage } from '@/server/auth/require-current-company';
import { getSubscriptionState } from '@/server/billing/subscription';
import { trialUsageSummary } from '@/server/billing/trial-usage';
import { officialWhatsappReady } from '@/server/whatsapp/cloud-api';
import { SubscriptionView } from '@/components/assinatura/subscription-view';
import { cycleOf } from '@/lib/billing/plans';
import { trialCatalog } from '@/server/billing/features';
import { TrialCatalog } from '@/components/assinatura/trial-catalog';

export const metadata = { title: 'Assinatura' };

export default async function AssinaturaPage() {
  const { company } = await requireAdminPage();
  const state = getSubscriptionState(company);
  // No teste: o que já usou do Profissional (e some no Básico).
  const trialUsage =
    state.status === 'TRIAL' && !state.trialPending ? await trialUsageSummary(company.id) : [];
  return (
    <div className="flex flex-col gap-6">
      <SubscriptionView
        state={{ ...state, hasSubscription: Boolean(company.asaasSubscriptionId) }}
        companyName={company.name}
        trialUsage={trialUsage}
        billingCycle={cycleOf(company.billingCycle)}
        officialWhatsapp={officialWhatsappReady()}
      />
      <TrialCatalog items={trialCatalog(company)} />
    </div>
  );
}
