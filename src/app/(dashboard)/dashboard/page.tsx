import { requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  getBusiestHours,
  getDashboardKpis,
  getRevenueByDay,
  getTopProfessional,
  getTopService,
  percentDelta,
} from '@/server/data/dashboard';
import { StatTile } from '@/components/dashboard/stat-tile';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { BusiestHoursChart } from '@/components/dashboard/busiest-hours-chart';
import { TopPerformerCard } from '@/components/dashboard/top-performer-card';
import { formatCurrencyBRL } from '@/lib/serialize';

export default async function DashboardPage() {
  const { company } = await requireCurrentCompany();

  const [kpis, revenueByDay, busiestHours, topProfessional, topService] = await Promise.all([
    getDashboardKpis(company.id),
    getRevenueByDay(company.id, company.timezone, 14),
    getBusiestHours(company.id, company.timezone),
    getTopProfessional(company.id),
    getTopService(company.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {company.name}</h1>
        <p className="text-muted-foreground text-sm">
          Visão geral dos últimos 30 dias, comparada aos 30 dias anteriores.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Faturamento"
          value={formatCurrencyBRL(kpis.revenue)}
          delta={percentDelta(kpis.revenue, kpis.revenuePrev)}
        />
        <StatTile
          label="Ticket médio"
          value={formatCurrencyBRL(kpis.avgTicket)}
          delta={percentDelta(kpis.avgTicket, kpis.avgTicketPrev)}
        />
        <StatTile
          label="Atendimentos concluídos"
          value={String(kpis.completedCount)}
          delta={percentDelta(kpis.completedCount, kpis.completedCountPrev)}
        />
        <StatTile
          label="Novos clientes"
          value={String(kpis.newClientsCount)}
          delta={percentDelta(kpis.newClientsCount, kpis.newClientsCountPrev)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <TopPerformerCard
          label="Profissional destaque"
          performer={topProfessional}
          countLabel="atendimentos"
        />
        <TopPerformerCard label="Serviço destaque" performer={topService} countLabel="vendas" />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">Faturamento por dia</h2>
        <p className="text-muted-foreground mb-4 text-xs">
          Últimos 14 dias · agendamentos concluídos
        </p>
        <RevenueChart data={revenueByDay} />
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="text-sm font-medium">Horários mais movimentados</h2>
        <p className="text-muted-foreground mb-4 text-xs">Últimos 30 dias</p>
        <BusiestHoursChart hours={busiestHours} />
      </div>
    </div>
  );
}
