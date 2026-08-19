import { requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  getProfessionalMonthlyProduction,
  listAllProfessionals,
} from '@/server/data/professionals';
import { serializeProfessional } from '@/lib/serialize';
import { ProfessionalList } from '@/components/profissionais/professional-list';

export default async function ProfissionaisPage() {
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
