import { OrganizationProfile } from '@clerk/nextjs';

import { requireAdminPage } from '@/server/auth/require-current-company';
import { TimezoneCard } from '@/components/configuracoes/timezone-card';
import { OnlineBookingCard } from '@/components/configuracoes/online-booking-card';
import { isOnlineBookingEnabled } from '@/server/data/public-booking';
import { headers } from 'next/headers';
import { PageHeader } from '@/components/layout/page';

export default async function ConfiguracoesPage() {
  const { company } = await requireAdminPage();
  const bookingEnabled = await isOnlineBookingEnabled(company.clerkOrgId);
  const h = await headers();
  const host = h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;

  return (
    <div className="flex w-full flex-col gap-8">
      <PageHeader
        title="Configurações"
        description="Dados da empresa, aparência, organização e membros da equipe."
      />

      <OnlineBookingCard
        initialEnabled={bookingEnabled}
        url={`${baseUrl}/agendar/${company.slug}`}
      />

      <TimezoneCard companyName={company.name} timezone={company.timezone} />

      <section className="flex flex-col gap-2">
        <h2 className="text-label-secondary px-5 text-[13px] font-medium uppercase">
          Organização e membros
        </h2>
        <OrganizationProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: 'w-full',
              cardBox: 'w-full max-w-none shadow-none rounded-[22px] ring-1 ring-foreground/[0.06]',
            },
          }}
        />
      </section>
    </div>
  );
}
