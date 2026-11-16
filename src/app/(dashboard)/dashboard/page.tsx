import Link from 'next/link';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { prisma } from '@/lib/db';
import { SetupChecklist } from '@/components/dashboard/setup-checklist';
import { getBusiestHours } from '@/server/data/dashboard';
import {
  getMonthProgress,
  getProfessionalGoals,
  getRevenueGoal,
  getTodayOverview,
} from '@/server/data/insights';
import { isCompanyAdmin } from '@/server/auth/require-current-company';
import { REPORT_PRESETS, type ReportPreset } from '@/lib/validations/report';
import { TodayStrip } from '@/components/dashboard/today-strip';
import { AttentionCard } from '@/components/dashboard/attention-card';
import { featureAccessFor } from '@/server/billing/features';
import { getUsageSummary } from '@/server/ai/quota';
import { GoalCard } from '@/components/dashboard/goal-card';
import { MIN_PEAK_SAMPLE, findPeakHour } from '@/lib/dashboard-rules';
import { LapsedClientsCard } from '@/components/dashboard/lapsed-clients-card';
import { UnitsLink } from '@/components/dashboard/units-link';
import { ReturnsCard } from '@/components/dashboard/returns-card';
import { listDueReturns, returnMessage } from '@/server/data/returns';
import { BusiestHoursChart } from '@/components/dashboard/busiest-hours-chart';
import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { TodayAgendaCard } from '@/components/dashboard/today-agenda-card';
import { listAppointmentsInRange } from '@/server/data/appointments';
import { addDays, getTodayInTz, startOfCalendarDateUtc } from '@/lib/time';
import { DailySummaryCard } from '@/components/dashboard/daily-summary-card';
import { TasksCard } from '@/components/dashboard/tasks-card';
import { MobileSections } from '@/components/layout/mobile-sections';
import { getOwnProfessional } from '@/server/auth/professional-scope';
import { getMyEarnings } from '@/server/data/my-earnings';
import { resolveReportRange } from '@/lib/report-range';
import { formatCurrencyBRL } from '@/lib/serialize';
import {
  DashboardPeriodProvider,
  PeriodResults,
  PeriodTeam,
} from '@/components/dashboard/dashboard-period';
import { getDashboardPeriod } from '@/server/data/dashboard-period';
import { getCompanyRevenueTarget } from '@/server/data/goals';

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

  const today = getTodayInTz(company.timezone);

  // Profissional com login próprio: o dia dele e quanto já fez no mês (nada da empresa toda).
  const own = await getOwnProfessional();
  if (own) {
    const { greeting, date } = greetingFor(company.timezone, new Date());
    const [mine, earnings] = await Promise.all([
      listAppointmentsInRange(
        company.id,
        {
          startAt: startOfCalendarDateUtc(today, company.timezone),
          endAt: startOfCalendarDateUtc(addDays(today, 1), company.timezone),
        },
        { professionalId: own.id },
      ),
      getMyEarnings(company.id, own.id, resolveReportRange('thisMonth', company.timezone)),
    ]);
    return (
      <div className="flex w-full flex-col gap-4 md:gap-5">
        <DashboardHero
          eyebrow={date}
          title={`${greeting}, ${own.name.split(' ')[0]}!`}
          subtitle="Seus horários de hoje e quanto você já fez no mês."
        />
        <div className="grid grid-cols-1 items-start gap-4 md:gap-5 lg:grid-cols-2">
          <TodayAgendaCard
            timezone={company.timezone}
            appointments={mine.map((a) => ({
              id: a.id,
              startAt: a.startAt,
              status: a.status,
              clientName: a.client.name,
              serviceName: a.serviceNameSnapshot,
              professionalName: a.professional.name,
              professionalColor: a.professional.color,
            }))}
          />
          <AppleTile interactive={false} className="flex flex-col gap-4">
            <TileEyebrow>Meu mês até agora</TileEyebrow>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[24px] leading-tight font-semibold tabular-nums">
                  {earnings.appointments}
                </div>
                <div className="text-label-secondary text-[12px]">Atendimentos</div>
              </div>
              <div>
                <div className="truncate text-[24px] leading-tight font-semibold tabular-nums">
                  {formatCurrencyBRL(earnings.production)}
                </div>
                <div className="text-label-secondary text-[12px]">Produção</div>
              </div>
              <div>
                <div className="text-system-green truncate text-[24px] leading-tight font-semibold tabular-nums">
                  {earnings.commission === null ? '—' : formatCurrencyBRL(earnings.commission)}
                </div>
                <div className="text-label-secondary text-[12px]">Comissão</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <Link
                href="/meus-ganhos"
                className="text-system-blue text-[14px] font-medium hover:underline"
              >
                Ver meus ganhos
              </Link>
              <Link
                href="/metas"
                className="text-system-blue text-[14px] font-medium hover:underline"
              >
                Ver minha meta
              </Link>
            </div>
          </AppleTile>
        </div>
        <TasksCard />
      </div>
    );
  }
  // Créditos de IA do mês (só nos planos com assistente): aviso quando estiver acabando.
  const ai = featureAccessFor(company).entitlements.ai;
  const [overview, todayAppointments, aiCredits] = await Promise.all([
    getTodayOverview(company.id, company.timezone),
    listAppointmentsInRange(company.id, {
      startAt: startOfCalendarDateUtc(today, company.timezone),
      endAt: startOfCalendarDateUtc(addDays(today, 1), company.timezone),
    }),
    ai.included?.assistant && ai.monthlyUnits > 0
      ? getUsageSummary(company.id, company.timezone, ai.monthlyUnits)
      : Promise.resolve(null),
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
  // Retorno por serviço: tarefa de recepção também, então aparece para o dono e para a equipe.
  const [dueReturns, returnsConfigured] = await Promise.all([
    listDueReturns(company.id),
    prisma.service.count({
      where: { companyId: company.id, active: true, returnAfterDays: { not: null } },
    }),
  ]);
  const returnsCard = (
    <ReturnsCard
      configured={returnsConfigured > 0}
      total={dueReturns.length}
      items={dueReturns.slice(0, 5).map((r) => ({
        clientId: r.clientId,
        name: r.name,
        phone: r.phone,
        serviceName: r.serviceName,
        daysLate: r.daysLate,
        message: returnMessage(r),
      }))}
    />
  );

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

  // "Meu dia" e tarefas: para toda a equipe, em todos os planos.
  const followUp = (
    <div className="grid grid-cols-1 items-start gap-4 md:gap-5 lg:grid-cols-2">
      <TasksCard />
      <DailySummaryCard />
    </div>
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
          <AttentionCard overview={overview} isAdmin={false} aiCredits={aiCredits} />
          {agendaCard}
        </div>
        {followUp}
        {returnsCard}
      </div>
    );
  }

  const [period, busiestHours, goal, month, teamGoals] = await Promise.all([
    getDashboardPeriod(company.id, company.timezone, preset),
    getBusiestHours(company.id, company.timezone),
    // Meta da aba Metas (recebido); sem ela, a meta antiga guardada no Clerk.
    getCompanyRevenueTarget(company.id, company.timezone).then(
      (target) => target ?? getRevenueGoal(company.clerkOrgId),
    ),
    getMonthProgress(company.id, company.timezone),
    getProfessionalGoals(company.id, company.timezone),
  ]);
  // Mesma janela e mesma regra do gráfico; sem agendamentos suficientes não há "pico" a apontar.
  const { peak, sample: peakSample } = findPeakHour(busiestHours);

  const todaySection = (
    <>
      {serviceCount === 0 && professionalCount === 0 ? (
        // Conta nova e vazia: o assistente monta serviços, equipe, horário e link de uma vez.
        <Link
          href="/comecar"
          className="bg-system-blue flex flex-wrap items-center justify-between gap-3 rounded-[22px] px-6 py-5 text-white shadow-[0_16px_40px_-20px_var(--system-blue)] transition-transform hover:scale-[1.005]"
        >
          <span>
            <span className="block text-[19px] font-semibold">
              Configure sua agenda em 2 minutos
            </span>
            <span className="text-[14px] text-white/85">
              Serviços sugeridos para o seu tipo de negócio, equipe, horário e link de agendamento
              online.
            </span>
          </span>
          <span className="rounded-full bg-white px-5 py-2 text-[15px] font-semibold text-[#007aff]">
            Começar
          </span>
        </Link>
      ) : (
        <SetupChecklist steps={setupSteps} />
      )}
      <DashboardHero
        eyebrow={date}
        title={`${greeting}, ${company.name}.`}
        subtitle="O dia de hoje, o que precisa de atenção e como o negócio está indo."
      />
      <UnitsLink />
      <TodayStrip overview={overview} showMoney />
      <div className="grid grid-cols-1 items-start gap-4 md:gap-5 lg:grid-cols-2">
        <AttentionCard overview={overview} isAdmin aiCredits={aiCredits} />
        {agendaCard}
      </div>
      {followUp}
      {returnsCard}
    </>
  );

  const resultsSection = (
    <>
      <PeriodResults
        aside={
          <LapsedClientsCard
            clients={overview.lapsed.top}
            total={overview.lapsed.count}
            withHistory={overview.lapsed.withHistory}
          />
        }
      />
      <div className="grid grid-cols-1 items-start gap-4 md:gap-5 lg:grid-cols-3">
        <AppleTile interactive={false} className="lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div>
              <TileEyebrow>Horários mais movimentados</TileEyebrow>
              <div className="mt-1 text-[28px] leading-none font-semibold tracking-[-0.025em]">
                {peak ? `Pico às ${String(peak.hour).padStart(2, '0')}h` : 'Sem dados suficientes'}
              </div>
            </div>
            <span className="text-label-secondary text-xs">Últimos 30 dias</span>
          </div>
          {peak ? (
            <BusiestHoursChart hours={busiestHours} />
          ) : (
            <div className="bg-foreground/[0.04] text-label-secondary flex h-40 flex-col items-center justify-center gap-1 rounded-2xl px-6 text-center text-[13px]">
              <span className="text-foreground text-[14px] font-medium">
                Ainda não dá para apontar o horário de pico
              </span>
              <span>
                Precisa de pelo menos {MIN_PEAK_SAMPLE} agendamentos nos últimos 30 dias (hoje:{' '}
                {peakSample}).
              </span>
            </div>
          )}
        </AppleTile>
        <GoalCard
          goal={goal}
          revenue={month.revenue}
          projection={month.projection}
          dayOfMonth={month.dayOfMonth}
          totalDays={month.totalDays}
        />
      </div>
    </>
  );

  return (
    <DashboardPeriodProvider initial={period}>
      <MobileSections
        sections={[
          { id: 'hoje', label: 'Hoje', content: todaySection },
          { id: 'resultados', label: 'Resultados', content: resultsSection },
          {
            id: 'equipe',
            label: 'Equipe',
            content: <PeriodTeam goals={teamGoals} />,
          },
        ]}
      />
    </DashboardPeriodProvider>
  );
}
