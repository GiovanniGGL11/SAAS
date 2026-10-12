import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { prisma } from '@/lib/db';
import { SetupChecklist } from '@/components/dashboard/setup-checklist';
import {
  getBusiestHours,
  getDashboardKpis,
  getRevenueByDay,
  getTopProfessional,
  getTopService,
  percentDelta,
} from '@/server/data/dashboard';
import { KpiTile } from '@/components/dashboard/kpi-tile';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { BusiestHoursChart } from '@/components/dashboard/busiest-hours-chart';
import { TopPerformerCard } from '@/components/dashboard/top-performer-card';
import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { TodayAgendaCard } from '@/components/dashboard/today-agenda-card';
import { formatCurrencyBRL } from '@/lib/serialize';
import { listAppointmentsInRange } from '@/server/data/appointments';
import { addDays, getTodayInTz, startOfCalendarDateUtc } from '@/lib/time';

function greetingFor(timezone: string, now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: timezone,
    }).format(now),
  );
  const greeting =
    hour < 5 ? 'Boa noite' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const date = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(now);
  return { greeting, date };
}

export default async function DashboardPage() {
  const { company } = await requireCurrentCompany();

  const today = getTodayInTz(company.timezone);
  const [kpis, revenueByDay, busiestHours, topProfessional, topService, todayAppointments] =
    await Promise.all([
      getDashboardKpis(company.id),
      getRevenueByDay(company.id, company.timezone, 14),
      getBusiestHours(company.id, company.timezone),
      getTopProfessional(company.id),
      getTopService(company.id),
      listAppointmentsInRange(company.id, {
        startAt: startOfCalendarDateUtc(today, company.timezone),
        endAt: startOfCalendarDateUtc(addDays(today, 1), company.timezone),
      }),
    ]);

  const [serviceCount, professionalCount, availabilityCount, clientCount, appointmentCount] =
    await Promise.all([
      prisma.service.count({ where: { companyId: company.id, active: true } }),
      prisma.professional.count({ where: { companyId: company.id, active: true } }),
      prisma.professionalAvailability.count({ where: { professional: { companyId: company.id } } }),
      prisma.client.count({ where: { companyId: company.id } }),
      prisma.appointment.count({ where: { companyId: company.id } }),
    ]);
  const setupSteps = [
    {
      label: 'Cadastre seus serviços',
      hint: 'Nome, duração e preço de cada um.',
      href: '/servicos',
      done: serviceCount > 0,
    },
    {
      label: 'Cadastre a equipe',
      hint: 'Cada profissional vira uma coluna da agenda.',
      href: '/profissionais',
      done: professionalCount > 0,
    },
    {
      label: 'Defina o expediente',
      hint: 'Em Profissionais → Editar. A agenda fica cinza fora do horário.',
      href: '/profissionais',
      done: availabilityCount > 0,
    },
    {
      label: 'Cadastre ou importe clientes',
      hint: 'Ou cadastre na hora de agendar.',
      href: '/clientes',
      done: clientCount > 0,
    },
    {
      label: 'Faça o primeiro agendamento',
      hint: 'Clique num horário vazio da agenda.',
      href: '/agenda',
      done: appointmentCount > 0,
    },
  ];

  const { greeting, date } = greetingFor(company.timezone, new Date());
  const revenue14d = revenueByDay.reduce((sum, d) => sum + d.revenue, 0);
  // Same 7h–21h window BusiestHoursChart plots, so the headline matches the highlighted bar.
  const peak = busiestHours.reduce<(typeof busiestHours)[number] | null>(
    (best, h) =>
      h.hour >= 7 && h.hour < 21 && h.count > 0 && (!best || h.count > best.count) ? h : best,
    null,
  );

  return (
    <div className="flex w-full flex-col gap-4 md:gap-5">
      <SetupChecklist steps={setupSteps} />
      <DashboardHero
        eyebrow={date}
        title={`${greeting}, ${company.name}.`}
        subtitle="Visão geral dos últimos 30 dias, comparada aos 30 dias anteriores."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 lg:grid-cols-4">
        <KpiTile
          index={0}
          label="Faturamento"
          value={kpis.revenue}
          format="currency"
          delta={percentDelta(kpis.revenue, kpis.revenuePrev)}
        />
        <KpiTile
          index={1}
          label="Ticket médio"
          value={kpis.avgTicket}
          format="currency"
          delta={percentDelta(kpis.avgTicket, kpis.avgTicketPrev)}
        />
        <KpiTile
          index={2}
          label="Atendimentos concluídos"
          value={kpis.completedCount}
          format="integer"
          delta={percentDelta(kpis.completedCount, kpis.completedCountPrev)}
        />
        <KpiTile
          index={3}
          label="Novos clientes"
          value={kpis.newClientsCount}
          format="integer"
          delta={percentDelta(kpis.newClientsCount, kpis.newClientsCountPrev)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-3">
        <AppleTile index={0} interactive={false} className="lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <TileEyebrow>Faturamento por dia</TileEyebrow>
              <div className="mt-1 text-[28px] leading-none font-semibold tracking-[-0.025em] tabular-nums">
                {formatCurrencyBRL(revenue14d)}
              </div>
            </div>
            <span className="text-label-secondary text-xs">
              Últimos 14 dias · agendamentos concluídos
            </span>
          </div>
          <RevenueChart data={revenueByDay} />
        </AppleTile>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-1">
          <TopPerformerCard
            index={1}
            label="Profissional destaque"
            performer={topProfessional}
            countLabel="atendimentos"
          />
          <TopPerformerCard
            index={2}
            label="Serviço destaque"
            performer={topService}
            countLabel="vendas"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-3">
        <AppleTile interactive={false} className="lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <TileEyebrow>Horários mais movimentados</TileEyebrow>
              <div className="mt-1 text-[28px] leading-none font-semibold tracking-[-0.025em]">
                {peak ? `Pico às ${String(peak.hour).padStart(2, '0')}h` : 'Sem movimento'}
              </div>
            </div>
            <span className="text-label-secondary text-xs">Últimos 30 dias</span>
          </div>
          <BusiestHoursChart hours={busiestHours} />
        </AppleTile>
        <TodayAgendaCard
          timezone={company.timezone}
          appointments={todayAppointments.map((a) => ({
            id: a.id,
            startAt: a.startAt,
            status: a.status,
            clientName: a.client.name,
            serviceName: a.serviceNameSnapshot,
            professionalName: a.professional.name,
            professionalColor: a.professional.color,
          }))}
        />
      </div>
    </div>
  );
}
