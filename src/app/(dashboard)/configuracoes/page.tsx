import { OrganizationProfile } from '@clerk/nextjs';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { TimezoneCard } from '@/components/configuracoes/timezone-card';

export default async function ConfiguracoesPage() {
  const { company } = await requireCurrentCompany();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm">
          Dados da empresa, organização e membros da equipe.
        </p>
      </div>

      <TimezoneCard companyName={company.name} timezone={company.timezone} />

      <div className="rounded-lg border p-4">
        <h2 className="mb-4 text-sm font-medium">Organização</h2>
        <OrganizationProfile routing="hash" />
      </div>
    </div>
  );
}
