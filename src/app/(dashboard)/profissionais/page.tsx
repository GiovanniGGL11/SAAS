import { denyProfessionalPage } from '@/server/auth/professional-scope';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  getProfessionalMonthlyProduction,
  listAllProfessionals,
} from '@/server/data/professionals';
import { serializeProfessional } from '@/lib/serialize';
import { ProfessionalList } from '@/components/profissionais/professional-list';

export default async function ProfissionaisPage() {
  // Profissional logado não abre esta tela (vê só a agenda, os clientes e os ganhos dele).
  await denyProfessionalPage();
  const { company } = await requireCurrentCompany();
  const professionals = await listAllProfessionals(company.id);

  const withProduction = await Promise.all(
    professionals.map(async (professional) => ({
      ...serializeProfessional(professional),
      production: await getProfessionalMonthlyProduction(company.id, professional.id),
    })),
  );

  return <ProfessionalList initialProfessionals={withProduction} />;
}
