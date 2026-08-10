import { requireCurrentCompany } from '@/server/auth/require-current-company';

export default async function DashboardPage() {
  const { company } = await requireCurrentCompany();

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Olá, {company.name}</h1>
      <p className="text-muted-foreground text-sm">
        O dashboard com KPIs de faturamento, agenda e clientes chega numa próxima fase.
      </p>
    </div>
  );
}
