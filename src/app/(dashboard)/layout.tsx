import { redirect } from 'next/navigation';

import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
import { DemoBanner } from '@/components/demo/demo-controls';
import {
  NoActiveOrganizationError,
  UnauthenticatedError,
  isCompanyAdmin,
  requireCurrentCompany,
} from '@/server/auth/require-current-company';
import { getSubscriptionState } from '@/server/billing/subscription';
import { BillingBanner, BillingGate } from '@/components/assinatura/billing-gate';

/** Aviso de cobrança: últimos 7 dias de teste ou pagamento atrasado. */
function bannerText(state: ReturnType<typeof getSubscriptionState>): string | null {
  if (state.status === 'PAST_DUE') return 'O pagamento da assinatura está atrasado.';
  if (state.status === 'TRIAL' && state.trialDaysLeft <= 7) {
    return state.trialDaysLeft > 0
      ? `Faltam ${state.trialDaysLeft} ${state.trialDaysLeft === 1 ? 'dia' : 'dias'} do seu teste grátis.`
      : 'Seu teste grátis terminou.';
  }
  return null;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let isDemo = false;
  let billing: ReturnType<typeof getSubscriptionState> | null = null;
  let isAdmin = false;
  try {
    const session = await requireCurrentCompany();
    isDemo = session.company.isDemo;
    isAdmin = isCompanyAdmin(session);
    billing = getSubscriptionState(session.company);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect('/sign-in');
    }
    if (error instanceof NoActiveOrganizationError) {
      redirect('/onboarding');
    }
    throw error;
  }

  return (
    <div className="font-apple flex flex-1">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo && <DemoBanner />}
        {isAdmin && !isDemo && billing?.configured && <BillingBanner text={bannerText(billing)} />}
        <Topbar />
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:p-8">
          <BillingGate blocked={!isDemo && Boolean(billing?.blocked)} isAdmin={isAdmin}>
            {children}
          </BillingGate>
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
