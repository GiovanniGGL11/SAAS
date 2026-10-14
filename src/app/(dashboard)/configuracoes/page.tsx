import { OrganizationProfile } from '@clerk/nextjs';

import { requireAdminPage } from '@/server/auth/require-current-company';
import { TimezoneCard } from '@/components/configuracoes/timezone-card';
import { OnlineBookingCard } from '@/components/configuracoes/online-booking-card';
import { ClientAreaCard } from '@/components/configuracoes/client-area-card';
import { RemindersSettingsCard } from '@/components/configuracoes/reminders-card';
import { isEmailConfigured } from '@/server/email';
import { isOnlineBookingEnabled } from '@/server/data/public-booking';
import { appBaseUrl } from '@/server/app-url';
import { PageHeader } from '@/components/layout/page';

export default async function ConfiguracoesPage() {
  const { company } = await requireAdminPage();
  const [bookingEnabled, baseUrl] = await Promise.all([
    isOnlineBookingEnabled(company.clerkOrgId),
    appBaseUrl(),
  ]);

  return (
    <div className="flex w-full flex-col gap-8">
      <PageHeader
        title="Configurações"
        description="Agendamento online, área do cliente, lembretes, fuso horário e equipe."
      />

      <OnlineBookingCard
        initialEnabled={bookingEnabled}
        url={`${baseUrl}/agendar/${company.slug}`}
      />

      <ClientAreaCard
        initialWhatsapp={company.whatsapp}
        entryUrl={`${baseUrl}/cliente/entrar/${company.slug}`}
      />

      <RemindersSettingsCard
        initialEnabled={company.remindersByEmail}
        emailConfigured={isEmailConfigured() && Boolean(process.env.CRON_SECRET?.trim())}
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
