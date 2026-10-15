import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { prisma } from '@/lib/db';
import { SetupChecklist } from '@/components/dashboard/setup-checklist';
import { getBusiestHours, percentDelta } from '@/server/data/dashboard';
import {
  getMonthProgress,
  getPeriodInsights,
  getProfessionalGoals,
  getRevenueByDayInRange,
  getRevenueGoal,
  getTodayOverview,
} from '@/server/data/insights';
import { isCompanyAdmin } from '@/server/auth/require-current-company';
import { resolveReportRange } from '@/lib/report-range';
import { REPORT_PRESETS, type ReportPreset } from '@/lib/validations/report';
import { PeriodPicker } from '@/components/dashboard/period-picker';
import { TodayStrip } from '@/components/dashboard/today-strip';
import { AttentionCard } from '@/components/dashboard/attention-card';
import { GoalCard } from '@/components/dashboard/goal-card';
import { TeamPerformance } from '@/components/dashboard/team-performance';
import { LapsedClientsCard } from '@/components/dashboard/lapsed-clients-card';
import { KpiTile } from '@/components/dashboard/kpi-tile';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { BusiestHoursChart } from '@/components/dashboard/busiest-hours-chart';
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

const COMPARE_LABEL: Record<ReportPreset, string> = {
  last7: 'vs. 7 dias anteriores',
  last30: 'vs. 30 dias anteriores',
  last90: 'vs. 90 dias anteriores',
  thisMonth: 'vs. mesmo número de dias antes',
  lastMonth: 'vs. o mês anterior',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Diferença em pontos percentuais entre duas taxas (null se faltar uma delas). */
const ppDelta = (current: number | null, previous: number | null) =>
  current === null || previous === null ? null : Math.round((current - previous) * 10) / 10;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const session = await requireCurrentCompany();
  const { company } = session;
  const isAdmin = isCompanyAdmin(session);
  const { periodo } = await searchParams;
  const preset: ReportPreset = REPORT_PRESETS.some((p) => p.value === periodo)
    ? (periodo as ReportPreset)
    : 'last30';
  const range = resolveReportRange(preset, company.timezone);

  const today = getTodayInTz(company.timezone);
  const [overview, todayAppointments] = await Promise.all([
    getTodayOverview(company.id, company.timezone),
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
  const agendaCard = (
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
  );

  // A equipe vê o dia de trabalho; números de dinheiro e gestão ficam com o dono.
  if (!isAdmin) {
    return (
      <div className="flex w-full flex-col gap-4 md:gap-5">
        <DashboardHero
          eyebrow={date}
          title={`${greeting}!`}
          subtitle="Seu dia na agenda, em um olhar."
        />
        <TodayStrip overview={overview} showMoney={false} />
        <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-2">
          <AttentionCard overview={overview} isAdmin={false} />
          {agendaCard}
        </div>
      </div>
    );
  }

  const [insights, revenueByDay, busiestHours, goal, month, teamGoals] = await Promise.all([
    getPeriodInsights(company.id, company.timezone, range),
    getRevenueByDayInRange(company.id, company.timezone, range),
    getBusiestHours(company.id, company.timezone),
    getRevenueGoal(company.clerkOrgId),
    getMonthProgress(company.id, company.timezone),
    getProfessionalGoals(company.id, company.timezone),
  ]);
  const { current, previous } = insights;
  const compareLabel = COMPARE_LABEL[preset];
  const periodLabel = REPORT_PRESETS.find((p) => p.value === preset)!.label.toLowerCase();
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
        subtitle="O dia de hoje, o que precisa de atenção e como o negócio está indo."
      />

      <TodayStrip overview={overview} showMoney />

      <div className="grid grid-cols-1 items-start gap-4 md:gap-5 lg:grid-cols-2">
        <AttentionCard overview={overview} isAdmin />
        <GoalCard
          goal={goal}
          revenue={month.revenue}
          projection={month.projection}
          dayOfMonth={month.dayOfMonth}
          totalDays={month.totalDays}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-bold tracking-[-0.02em] md:text-[26px]">
            Como o negócio está indo
          </h2>
          <p className="text-label-secondary text-[14px]">
            {REPORT_PRESETS.find((p) => p.value === preset)!.label},{' '}
            {compareLabel.replace('vs. ', 'comparado com ')}.
          </p>
        </div>
        <PeriodPicker value={preset} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-5 lg:grid-cols-4">
        <KpiTile
          index={0}
          label="Faturamento"
          value={current.revenue}
          format="currency"
          delta={percentDelta(current.revenue, previous.revenue)}
          compareLabel={compareLabel}
          hint="Tudo o que entrou: serviços, produtos e gorjetas."
        />
        <KpiTile
          index={1}
          label="Atendimentos"
          value={current.completed}
          format="integer"
          delta={percentDelta(current.completed, previous.completed)}
          compareLabel={compareLabel}
          hint={
            current.onlineRate !== null
              ? `${current.onlineRate.toLocaleString('pt-BR')}% dos horários foram marcados online.`
              : 'Atendimentos concluídos no período.'
          }
        />
        <KpiTile
          index={2}
          label="Ticket médio"
          value={current.avgTicket}
          format="currency"
          delta={percentDelta(current.avgTicket, previous.avgTicket)}
          compareLabel={compareLabel}
          hint="Faturamento ÷ atendimentos."
        />
        <KpiTile
          index={3}
          label="Ocupação da equipe"
          value={current.occupancy}
          format="percent"
          delta={ppDelta(current.occupancy, previous.occupancy)}
          deltaUnit="p.p."
          compareLabel={compareLabel}
          hint="Tempo atendendo ÷ tempo disponível. No setor, 56% é a média e 75% é o topo."
        />
        <KpiTile
          index={0}
          label="Clientes que voltaram"
          value={current.returningRate}
          format="percent"
          delta={ppDelta(current.returningRate, previous.returningRate)}
          deltaUnit="p.p."
          compareLabel={compareLabel}
          hint={`${plural(current.clientsServed, 'cliente atendido', 'clientes atendidos')} · ${current.newClientsServed} pela primeira vez.`}
        />
        <KpiTile
          index={1}
          label="Já têm próximo horário"
          value={insights.rebookingRate}
          format="percent"
          compareLabel={compareLabel}
          hint="Dos clientes atendidos no período. Marcar o retorno na hora de cobrar aumenta este número."
        />
        <KpiTile
          index={2}
          label="Faltas e cancelamentos"
          value={current.lossRate}
          format="percent"
          delta={ppDelta(current.lossRate, previous.lossRate)}
          deltaUnit="p.p."
          lowerIsBetter
          compareLabel={compareLabel}
          hint={`${plural(current.noShows, 'falta', 'faltas')} e ${plural(current.cancellations, 'cancelamento', 'cancelamentos')}. Confirmar pelo WhatsApp reduz.`}
        />
        <KpiTile
          index={3}
          label="Novos clientes"
          value={current.newClientsServed}
          format="integer"
          delta={percentDelta(current.newClientsServed, previous.newClientsServed)}
          compareLabel={compareLabel}
          hint="Atendidos pela primeira vez no período."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-3">
        <AppleTile index={0} interactive={false} className="lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <TileEyebrow>Faturamento por dia</TileEyebrow>
              <div className="mt-1 text-[28px] leading-none font-semibold tracking-[-0.025em] tabular-nums">
                {formatCurrencyBRL(current.revenue)}
              </div>
            </div>
            <span className="text-label-secondary text-xs">
              {periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)} · entradas pagas
            </span>
          </div>
          <RevenueChart data={revenueByDay} />
        </AppleTile>
        <LapsedClientsCard clients={overview.lapsed.top} total={overview.lapsed.count} />
      </div>

      <TeamPerformance team={insights.team} goals={teamGoals} />

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
        {agendaCard}
      </div>
    </div>
  );
}
