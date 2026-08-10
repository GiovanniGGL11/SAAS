import { requireCurrentCompany } from '@/server/auth/require-current-company';

export default async function AgendaPage() {
  await requireCurrentCompany();

  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
      <p className="text-muted-foreground text-sm">
        A grade de horários (diária/semanal, arrastar, filtros) chega na próxima etapa desta fase.
      </p>
    </div>
  );
}
