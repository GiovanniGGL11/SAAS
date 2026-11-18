import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
import { ScrollingFlag } from '@/components/layout/scrolling-flag';
import { ProfilePhotoSync } from '@/components/layout/profile-photo-sync';
import { ViewerProvider } from '@/components/layout/viewer-context';
import { getOwnProfessional } from '@/server/auth/professional-scope';
import { DemoBanner } from '@/components/demo/demo-controls';
import {
  NoActiveOrganizationError,
  UnauthenticatedError,
  isCompanyAdmin,
  requireCurrentCompany,
} from '@/server/auth/require-current-company';
import { getSubscriptionState } from '@/server/billing/subscription';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import { BillingBanner, BillingGate } from '@/components/assinatura/billing-gate';
import { featureAccessFor } from '@/server/billing/features';
import { ReturnPrompt } from '@/components/retornos/return-prompt';
import { featureName } from '@/lib/billing/feature-trials';
import type { FeatureKey } from '@/lib/billing/plans';

/** Aviso de cobrança: últimos 7 dias de teste ou pagamento atrasado. */
function bannerText(state: ReturnType<typeof getSubscriptionState>): string | null {
  if (state.status === 'PAST_DUE') return 'O pagamento da assinatura está atrasado.';
  if (state.trialPending) return `Libere os seus ${TRIAL_DAYS} dias de teste grátis.`;
  if (state.status === 'TRIAL' && state.trialDaysLeft <= 7) {
    return state.trialDaysLeft > 0
      ? `Faltam ${state.trialDaysLeft} ${state.trialDaysLeft === 1 ? 'dia' : 'dias'} do seu teste grátis.`
      : 'Seu teste grátis terminou.';
  }
  return null;
}

/** Recursos em teste grátis: o que está liberado e até quando. */
function trialBannerText(
  trials: { key: FeatureKey; endsAt: string }[],
  timeZone: string,
): string | null {
  if (trials.length === 0) return null;
  const until = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  const list = trials.map((t) => `${featureName(t.key)} (até ${until(t.endsAt)})`).join(', ');
  return `Você está testando grátis: ${list}. Gostou? Assine para continuar usando.`;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let isDemo = false;
  let billing: ReturnType<typeof getSubscriptionState> | null = null;
  let isAdmin = false;
  let ownProfessionalId: string | null = null;
  let trials: { key: FeatureKey; endsAt: string }[] = [];
  let timeZone = 'America/Sao_Paulo';
  try {
    const session = await requireCurrentCompany();
    isDemo = session.company.isDemo;
    isAdmin = isCompanyAdmin(session);
    billing = getSubscriptionState(session.company);
    trials = featureAccessFor(session.company).trials;
    timeZone = session.company.timezone;
    ownProfessionalId = (await getOwnProfessional())?.id ?? null;
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
    <ViewerProvider professionalId={ownProfessionalId}>
      <div className="font-apple flex flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {isDemo && <DemoBanner />}
          {isAdmin && !isDemo && billing?.configured && (
            <BillingBanner text={bannerText(billing)} />
          )}
          {isAdmin && !isDemo && <BillingBanner text={trialBannerText(trials, timeZone)} />}
          <Topbar />
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:p-8">
            <BillingGate blocked={!isDemo && Boolean(billing?.blocked)} isAdmin={isAdmin}>
              {children}
            </BillingGate>
          </main>
        </div>
        <MobileTabBar />
        <ScrollingFlag />
        {ownProfessionalId && <ProfilePhotoSync />}
        {/* Retorno do paciente: dono e recepção (a profissional com login próprio não recebe). */}
        {!ownProfessionalId && !isDemo && (
          <Suspense fallback={null}>
            <ReturnPrompt />
          </Suspense>
        )}
      </div>
    </ViewerProvider>
  );
}
