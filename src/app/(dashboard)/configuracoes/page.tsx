import Link from 'next/link';
import { OrganizationProfile } from '@clerk/nextjs';
import { ChevronRightIcon, Link2Icon } from 'lucide-react';

import { requireAdminPage } from '@/server/auth/require-current-company';
import { TimezoneCard } from '@/components/configuracoes/timezone-card';
import { RemindersSettingsCard } from '@/components/configuracoes/reminders-card';
import { isEmailConfigured } from '@/server/email';
import { WhatsappAutomationCard } from '@/components/configuracoes/whatsapp-automation-card';
import { AiSettingsCard } from '@/components/configuracoes/ai-settings-card';
import { BusinessPreferencesCard } from '@/components/configuracoes/business-preferences-card';
import { CustomFieldsCard } from '@/components/configuracoes/custom-fields-card';
import { PageHeader } from '@/components/layout/page';
import { OpenDemoCard } from '@/components/demo/demo-controls';

export default async function ConfiguracoesPage() {
  const { company } = await requireAdminPage();

  return (
    <div className="flex w-full flex-col gap-8">
      <PageHeader
        title="Configurações"
        description="WhatsApp automático, inteligência artificial, preferências, campos personalizados, lembretes, fuso horário e equipe."
      />

      {/* O que o cliente vê ganhou página própria (menu lateral → Link do cliente). */}
      <Link
        href="/link-do-cliente"
        className="bg-tile hover:bg-foreground/[0.04] flex items-center gap-4 rounded-[22px] p-5"
      >
        <Link2Icon className="text-system-blue size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold">Link do cliente</h2>
          <p className="text-label-secondary text-[13px]">
            Agendamento online, página de agendamento, serviços no link, pagamento adiantado por
            PIX, área do cliente e avaliação no Google agora ficam numa página só.
          </p>
        </div>
        <ChevronRightIcon className="text-label-secondary size-5 shrink-0" />
      </Link>

      <WhatsappAutomationCard />

      <AiSettingsCard />

      <BusinessPreferencesCard />

      <CustomFieldsCard />

      <RemindersSettingsCard
        initialEnabled={company.remindersByEmail}
        emailConfigured={isEmailConfigured() && Boolean(process.env.CRON_SECRET?.trim())}
      />

      {!company.isDemo && <OpenDemoCard />}

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
