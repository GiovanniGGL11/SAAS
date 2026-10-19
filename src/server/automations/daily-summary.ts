import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { sessionsDone } from '@/lib/packages';
import { addDays, calendarDateToUtc, getTodayInTz, utcToMinutesSinceMidnight } from '@/lib/time';
import { hasFeature } from '@/server/billing/features';
import { getPreferences } from '@/server/data/business-preferences';
import { listUpcomingSupplyShortages } from '@/server/data/service-supplies';
import { expireStaleQuotes } from '@/server/data/quotes';
import { finishRun, recordSkip, startRun } from './runs';

/*
  Resumo do dia. Cálculo DETERMINÍSTICO, direto do banco, com contagens e links — sem IA (a IA só
  explica, quando a pessoa pede ao assistente). Respeita fuso e permissões: o bloco financeiro só
  vai para administradores. Nada de conteúdo clínico: só "ficha pendente", nunca respostas.
*/

export type SummaryItem = { label: string; detail?: string; href: string };
export type SummarySection = {
  key: string;
  title: string;
  count: number;
  items: SummaryItem[];
  adminOnly?: boolean;
};
export type DailySummaryContent = { date: string; sections: SummarySection[] };

const LIMIT = 8;

function hhmm(date: Date, timezone: string) {
  const m = utcToMinutesSinceMidnight(date, timezone);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export async function computeDailySummary(
  companyId: string,
  timezone: string,
  now = new Date(),
): Promise<DailySummaryContent> {
  const today = getTodayInTz(timezone);
  const start = calendarDateToUtc(today, 0, timezone);
  const end = calendarDateToUtc(addDays(today, 1), 0, timezone);
  const date = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
  await expireStaleQuotes(companyId);

  const [
    appointments,
    pendingForms,
    packages,
    quotes,
    receivables,
    lowStock,
    shortages,
    tasks,
    offers,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        companyId,
        startAt: { gte: start, lt: end },
        status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'DONE'] },
      },
      select: {
        id: true,
        startAt: true,
        status: true,
        serviceNameSnapshot: true,
        depositStatus: true,
        client: { select: { name: true } },
        professional: { select: { name: true } },
      },
      orderBy: { startAt: 'asc' },
    }),
    prisma.formEntry.findMany({
      where: {
        companyId,
        status: { in: ['REQUESTED', 'DRAFT'] },
        appointment: { startAt: { gte: start, lt: end }, status: { not: 'CANCELED' } },
      },
      select: {
        id: true,
        clientId: true,
        client: { select: { name: true } },
        template: { select: { name: true } },
      },
      take: 50,
    }),
    prisma.clientPackage.findMany({
      where: { companyId, status: 'ACTIVE', recurring: false },
      select: {
        id: true,
        clientId: true,
        nameSnapshot: true,
        sessionsTotal: true,
        periodEnd: true,
        client: { select: { name: true } },
        movements: { select: { kind: true, quantity: true } },
      },
      take: 500,
    }),
    prisma.quote.findMany({
      where: { companyId, status: 'SENT' },
      select: { id: true, number: true, title: true, client: { select: { name: true } } },
      orderBy: { number: 'desc' },
      take: 20,
    }),
    prisma.transaction.findMany({
      where: {
        companyId,
        type: 'INCOME',
        status: 'PENDING',
        OR: [{ dueDate: { lt: end } }, { dueDate: null }],
      },
      select: { id: true, amount: true, description: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
    prisma.$queryRaw<{ id: string; name: string; quantity: number }[]>`
        SELECT id, name, quantity FROM "Product"
        WHERE "companyId" = ${companyId} AND active = true AND quantity <= "minQuantity"
        ORDER BY quantity ASC LIMIT 20`,
    listUpcomingSupplyShortages(companyId, {
      from: now,
      to: new Date(now.getTime() + 2 * 86_400_000),
    }),
    prisma.task.findMany({
      where: { companyId, status: 'OPEN', OR: [{ dueAt: null }, { dueAt: { lt: end } }] },
      select: { id: true, title: true, dueAt: true },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }],
      take: 20,
    }),
    prisma.waitlistOffer.count({ where: { companyId, status: 'PENDING', expiresAt: { gt: now } } }),
  ]);

  const ending = packages
    .map((p) => ({ ...p, remaining: p.sessionsTotal - sessionsDone(p.movements) }))
    .filter(
      (p) =>
        p.remaining <= 1 ||
        (p.periodEnd &&
          p.periodEnd.getTime() > now.getTime() &&
          p.periodEnd.getTime() - now.getTime() < 15 * 86_400_000),
    );
  const pendingDeposits = appointments.filter((a) => a.depositStatus === 'PENDING');
  const receivableTotal = receivables.reduce((sum, t) => sum + Number(t.amount), 0);

  const sections: SummarySection[] = [
    {
      key: 'appointments',
      title: 'Atendimentos de hoje',
      count: appointments.length,
      items: appointments.slice(0, LIMIT).map((a) => ({
        label: `${hhmm(a.startAt, timezone)} · ${a.client.name}`,
        detail: `${a.serviceNameSnapshot} com ${a.professional.name}${a.status === 'DONE' ? ' (concluído)' : ''}`,
        href: `/agenda/atendimento/${a.id}`,
      })),
    },
    {
      key: 'forms',
      title: 'Fichas pendentes para hoje',
      count: pendingForms.length,
      items: pendingForms.slice(0, LIMIT).map((f) => ({
        label: f.client.name,
        detail: f.template.name,
        href: `/clientes/${f.clientId}?aba=fichas`,
      })),
    },
    {
      key: 'conflicts',
      title: 'Sinais por PIX aguardando',
      count: pendingDeposits.length,
      items: pendingDeposits.slice(0, LIMIT).map((a) => ({
        label: `${hhmm(a.startAt, timezone)} · ${a.client.name}`,
        detail: 'Horário reservado esperando o sinal',
        href: `/agenda/atendimento/${a.id}`,
      })),
    },
    {
      key: 'packages',
      title: 'Pacotes terminando',
      count: ending.length,
      items: ending.slice(0, LIMIT).map((p) => ({
        label: p.client.name,
        detail: `${p.nameSnapshot}: ${Math.max(p.remaining, 0)} restante${p.remaining === 1 ? '' : 's'}`,
        href: `/clientes/${p.clientId}?aba=pacotes`,
      })),
    },
    {
      key: 'quotes',
      title: 'Orçamentos aguardando resposta',
      count: quotes.length,
      items: quotes.slice(0, LIMIT).map((q) => ({
        label: `#${q.number} ${q.title}`,
        detail: q.client.name,
        href: `/clientes/orcamentos?id=${q.id}`,
      })),
    },
    {
      key: 'receivables',
      title: 'A receber (vencido ou vence hoje)',
      count: receivables.length,
      adminOnly: true,
      items: receivables.length
        ? [
            {
              label: `${receivables.length} lançamento${receivables.length === 1 ? '' : 's'}`,
              detail: `Total ${receivableTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
              href: '/financeiro',
            },
          ]
        : [],
    },
    {
      key: 'stock',
      title: 'Estoque',
      count: lowStock.length + shortages.length,
      items: [
        ...shortages.slice(0, 4).map((s) => ({
          label: s.name,
          detail: `Faltará para os próximos atendimentos: precisa de ${s.needed}, tem ${s.stock}`,
          href: '/estoque',
        })),
        ...lowStock.slice(0, 4).map((p) => ({
          label: p.name,
          detail: `Estoque baixo: ${p.quantity}`,
          href: '/estoque',
        })),
      ],
    },
    {
      key: 'tasks',
      title: 'Tarefas para hoje',
      count: tasks.length,
      items: tasks.slice(0, LIMIT).map((t) => ({ label: t.title, href: '/dashboard#tarefas' })),
    },
    {
      key: 'waitlist',
      title: 'Convites da lista de espera aguardando',
      count: offers,
      items: offers
        ? [
            {
              label: `${offers} convite${offers === 1 ? '' : 's'} pendente${offers === 1 ? '' : 's'}`,
              href: '/agenda',
            },
          ]
        : [],
    },
  ];
  return { date, sections };
}

/** O que a pessoa pode ver: o bloco financeiro só para administradores. */
export function summaryForViewer(
  content: DailySummaryContent,
  isAdmin: boolean,
): DailySummaryContent {
  return { ...content, sections: content.sections.filter((s) => isAdmin || !s.adminOnly) };
}

/**
 * Resumo automático (Pro): gera e guarda o do dia quando passou da hora configurada. A rota
 * diária e a abertura do painel chamam isto; gerar de novo no mesmo dia não duplica.
 */
export async function ensureAutomaticSummary(
  companyId: string,
  trigger: 'cron' | 'manual',
  now = new Date(),
) {
  const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!company || !hasFeature(company, 'dailySummaryAuto')) return null;
  const prefs = await getPreferences(companyId);
  if (!prefs.dailySummaryAuto) return null;
  if (prefs.automationsPaused || prefs.pausedRoutines.includes('daily_summary')) {
    if (trigger === 'cron') {
      await recordSkip(companyId, 'daily_summary', trigger, 'Pausado pelo administrador.');
    }
    return null;
  }
  if (utcToMinutesSinceMidnight(now, company.timezone) < prefs.dailySummaryHour * 60) return null;
  const today = getTodayInTz(company.timezone);
  const date = `${today.year}-${String(today.month).padStart(2, '0')}-${String(today.day).padStart(2, '0')}`;
  const existing = await prisma.dailySummary.findUnique({
    where: { companyId_date: { companyId, date } },
  });
  if (existing) return existing;
  const run = await startRun(companyId, 'daily_summary', trigger);
  try {
    const content = await computeDailySummary(companyId, company.timezone, now);
    const row = await prisma.dailySummary
      .create({
        data: { companyId, date, trigger, content: content as unknown as Prisma.InputJsonValue },
      })
      .catch(async () =>
        // Outra execução gravou primeiro: fica a dela.
        prisma.dailySummary.findUniqueOrThrow({ where: { companyId_date: { companyId, date } } }),
      );
    await finishRun(run.id, {
      status: 'COMPLETED',
      stats: Object.fromEntries(content.sections.map((s) => [s.key, s.count])),
    });
    return row;
  } catch (error) {
    await finishRun(run.id, { status: 'FAILED', note: 'Falha ao gerar o resumo.' });
    throw error;
  }
}
