import { redirect } from 'next/navigation';

import { requireAdminPage } from '@/server/auth/require-current-company';
import { needsOnboarding } from '@/server/data/onboarding';
import { appBaseUrl } from '@/server/app-url';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { TrialClaimCard } from '@/components/assinatura/trial-claim-card';

export const metadata = { title: 'Primeiros passos' };

export default async function ComecarPage() {
  const { company } = await requireAdminPage();
  // Conta já configurada não volta ao assistente.
  if (!(await needsOnboarding(company.id))) redirect('/dashboard');
  return (
    <div className="flex flex-col gap-6">
      {company.trialPending && (
        <div className="mx-auto w-full max-w-2xl">
          <TrialClaimCard />
        </div>
      )}
      <OnboardingWizard
        companyName={company.name}
        bookingUrl={`${await appBaseUrl()}/agendar/${company.slug}`}
      />
    </div>
  );
}
