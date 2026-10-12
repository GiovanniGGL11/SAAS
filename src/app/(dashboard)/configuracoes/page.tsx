import { OrganizationProfile } from '@clerk/nextjs';

import { requireAdminPage } from '@/server/auth/require-current-company';
import { TimezoneCard } from '@/components/configuracoes/timezone-card';
import { PageHeader } from '@/components/layout/page';

export default async function ConfiguracoesPage() {
  const { company } = await requireAdminPage();

  return (
    <div className="flex w-full flex-col gap-8">
      <PageHeader
        title="Configurações"
        description="Dados da empresa, aparência, organização e membros da equipe."
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
