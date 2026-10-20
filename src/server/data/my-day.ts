import { prisma } from '@/lib/db';
import { addDays, calendarDateToUtc, getTodayInTz } from '@/lib/time';
import type { FeatureKey } from '@/lib/billing/plans';
import { listDueReturns, returnMessage } from '@/server/data/returns';
import { expireStaleQuotes } from '@/server/data/quotes';
import { whatsappLink } from '@/lib/phone';

/*
  Central "Meu dia": o que precisa de atenção, de todos os módulos disponíveis, numa lista só.
  - Números e itens vêm de consultas diretas (sem IA, sem estimativa).
  - Urgência: atrasado → hoje → próximos dias; depois pela data.
  - Sem repetição: se uma tarefa aberta já cuida de um orçamento ou oportunidade, aparece só a
    tarefa.
  - Permissões: contas a pagar/receber só para administradores; documentos mostram só o status
    (nunca respostas). Módulos fora do plano não aparecem.
*/

export type MyDayKind =
  'appointment' | 'task' | 'return' | 'opportunity' | 'quote' | 'bill' | 'document';

export type MyDayItem = {
  key: string;
  kind: MyDayKind;
  title: string;
  detail: string | null;
  href: string;
  /** Instante de referência (prazo, horário). */
  at: string | null;
  urgency: 'overdue' | 'today' | 'upcoming';
  /** Ação rápida disponível. */
  action?: { type: 'complete_task'; taskId: string } | { type: 'whatsapp'; url: string };
  ownerUserId?: string | null;
};

export type MyDayViewer = {
  userId: string;
  isAdmin: boolean;
  features: Partial<Record<FeatureKey, boolean>>;
};

export async function getMyDay(
  companyId: string,
  timezone: string,
  viewer: MyDayViewer,
  options: { owner?: 'me' | 'all' | string; days?: number } = {},
  now = new Date(),
) {
  const days = Math.min(Math.max(options.days ?? 1, 1), 14);
  const today = getTodayInTz(timezone);
  const startToday = calendarDateToUtc(today, 0, timezone);
  const startTomorrow = calendarDateToUtc(addDays(today, 1), 0, timezone);
  const end = calendarDateToUtc(addDays(today, days), 0, timezone);
  const ownerId =
    options.owner === 'me'
      ? viewer.userId
      : options.owner && options.owner !== 'all'
        ? options.owner
        : undefined;
  const urgencyOf = (at: Date | null): MyDayItem['urgency'] =>
    !at ? 'upcoming' : at < startToday ? 'overdue' : at < startTomorrow ? 'today' : 'upcoming';

  if (viewer.features.quotes) await expireStaleQuotes(companyId);

  const [appointments, tasks, returns, opportunities, quotes, bills, documents] = await Promise.all(
    [
      prisma.appointment.findMany({
        where: {
          companyId,
          status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] },
          startAt: { gte: new Date(now.getTime() - 2 * 3_600_000), lt: end },
        },
        select: {
          id: true,
          startAt: true,
          status: true,
          serviceNameSnapshot: true,
          client: { select: { name: true } },
          professional: { select: { name: true } },
        },
        orderBy: { startAt: 'asc' },
        take: 30,
      }),
      prisma.task.findMany({
        where: {
          companyId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          dueAt: { lt: end },
          ...(ownerId ? { assignedUserId: ownerId } : {}),
        },
        select: {
          id: true,
          title: true,
          dueAt: true,
          priority: true,
          assignedUserId: true,
          quoteId: true,
          opportunityId: true,
          client: { select: { name: true } },
        },
        orderBy: { dueAt: 'asc' },
        take: 60,
      }),
      listDueReturns(companyId, 15).catch(() => []),
      viewer.features.crm
        ? prisma.opportunity.findMany({
            where: {
              companyId,
              status: 'OPEN',
              nextActionAt: { lt: end },
              ...(ownerId ? { ownerUserId: ownerId } : {}),
            },
            select: {
              id: true,
              title: true,
              nextAction: true,
              nextActionAt: true,
              ownerUserId: true,
              client: { select: { name: true } },
              contactName: true,
            },
            orderBy: { nextActionAt: 'asc' },
            take: 30,
          })
        : Promise.resolve([]),
      viewer.features.quotes
        ? prisma.quote.findMany({
            where: { companyId, status: 'SENT' },
            select: {
              id: true,
              number: true,
              title: true,
              sentAt: true,
              client: { select: { name: true } },
            },
            orderBy: { sentAt: 'asc' },
            take: 20,
          })
        : Promise.resolve([]),
      viewer.isAdmin
        ? prisma.transaction.findMany({
            where: { companyId, status: 'PENDING', dueDate: { lt: end } },
            select: { id: true, type: true, description: true, amount: true, dueDate: true },
            orderBy: { dueDate: 'asc' },
            take: 30,
          })
        : Promise.resolve([]),
      viewer.features.forms
        ? prisma.formEntry.findMany({
            where: {
              companyId,
              status: { in: ['REQUESTED', 'DRAFT'] },
              appointment: { startAt: { gte: startToday, lt: end }, status: { not: 'CANCELED' } },
            },
            select: {
              id: true,
              clientId: true,
              appointment: { select: { startAt: true } },
              client: { select: { name: true } },
              template: { select: { name: true } },
            },
            take: 30,
          })
        : Promise.resolve([]),
    ],
  );

  const coveredQuotes = new Set(tasks.map((t) => t.quoteId).filter(Boolean));
  const coveredOpps = new Set(tasks.map((t) => t.opportunityId).filter(Boolean));
  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const items: MyDayItem[] = [];

  for (const a of appointments) {
    items.push({
      key: `appointment:${a.id}`,
      kind: 'appointment',
      title: a.client.name,
      detail: `${a.serviceNameSnapshot} com ${a.professional.name}${a.status === 'IN_PROGRESS' ? ' · em atendimento' : a.status === 'SCHEDULED' ? ' · a confirmar' : ''}`,
      href: `/agenda/atendimento/${a.id}`,
      at: a.startAt.toISOString(),
      urgency: urgencyOf(a.startAt) === 'overdue' ? 'today' : urgencyOf(a.startAt),
    });
  }
  for (const t of tasks) {
    items.push({
      key: `task:${t.id}`,
      kind: 'task',
      title: t.title,
      detail:
        [
          t.client?.name,
          t.priority === 'URGENT' ? 'urgente' : t.priority === 'HIGH' ? 'prioridade alta' : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
      href: `/atividades?tarefa=${t.id}`,
      at: t.dueAt?.toISOString() ?? null,
      urgency: urgencyOf(t.dueAt),
      action: { type: 'complete_task', taskId: t.id },
      ownerUserId: t.assignedUserId,
    });
  }
  // Retorno de clientes (pelo "retorno sugerido" do serviço) — sem dono, entra só em "todos".
  if (!ownerId) {
    for (const r of returns) {
      const url = whatsappLink(r.phone, returnMessage(r));
      items.push({
        key: `return:${r.clientId}`,
        kind: 'return',
        title: r.name,
        detail: `Retorno de ${r.serviceName}${r.daysLate > 0 ? ` · ${r.daysLate} dia(s) de atraso` : ''}`,
        href: `/clientes/${r.clientId}`,
        at: r.dueAt.toISOString(),
        urgency: urgencyOf(r.dueAt),
        ...(url ? { action: { type: 'whatsapp' as const, url } } : {}),
      });
    }
  }
  for (const o of opportunities) {
    if (coveredOpps.has(o.id)) continue;
    items.push({
      key: `opportunity:${o.id}`,
      kind: 'opportunity',
      title: o.title,
      detail: [o.client?.name ?? o.contactName, o.nextAction].filter(Boolean).join(' · ') || null,
      href: `/comercial?aba=oportunidades&oportunidade=${o.id}`,
      at: o.nextActionAt?.toISOString() ?? null,
      urgency: urgencyOf(o.nextActionAt),
      ownerUserId: o.ownerUserId,
    });
  }
  if (!ownerId) {
    for (const q of quotes) {
      if (coveredQuotes.has(q.id)) continue;
      const waiting = q.sentAt ? Math.floor((now.getTime() - q.sentAt.getTime()) / 86_400_000) : 0;
      items.push({
        key: `quote:${q.id}`,
        kind: 'quote',
        title: `Orçamento #${q.number} ${q.title}`,
        detail: `${q.client.name} · aguardando resposta${waiting > 0 ? ` há ${waiting} dia(s)` : ''}`,
        href: `/comercial?aba=orcamentos&id=${q.id}`,
        at: q.sentAt?.toISOString() ?? null,
        // Orçamento esperando há mais de 3 dias pede retorno hoje.
        urgency: waiting >= 3 ? 'today' : 'upcoming',
      });
    }
    for (const b of bills) {
      items.push({
        key: `bill:${b.id}`,
        kind: 'bill',
        title: `${b.type === 'INCOME' ? 'A receber' : 'A pagar'}: ${b.description}`,
        detail: fmt(Number(b.amount)),
        href: '/financeiro',
        at: b.dueDate?.toISOString() ?? null,
        urgency: urgencyOf(b.dueDate),
      });
    }
    for (const d of documents) {
      items.push({
        key: `document:${d.id}`,
        kind: 'document',
        title: `${d.template.name} pendente`,
        detail: d.client.name,
        href: `/clientes/${d.clientId}?aba=fichas`,
        at: d.appointment?.startAt.toISOString() ?? null,
        urgency:
          urgencyOf(d.appointment?.startAt ?? null) === 'overdue'
            ? 'today'
            : urgencyOf(d.appointment?.startAt ?? null),
      });
    }
  }

  const rank = { overdue: 0, today: 1, upcoming: 2 } as const;
  items.sort(
    (a, b) =>
      rank[a.urgency] - rank[b.urgency] ||
      (a.at ? new Date(a.at).getTime() : Infinity) - (b.at ? new Date(b.at).getTime() : Infinity),
  );
  const seen = new Set<string>();
  const unique = items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
  return {
    days,
    items: unique,
    counts: {
      overdue: unique.filter((i) => i.urgency === 'overdue').length,
      today: unique.filter((i) => i.urgency === 'today').length,
      upcoming: unique.filter((i) => i.urgency === 'upcoming').length,
    },
  };
}

export type MyDay = Awaited<ReturnType<typeof getMyDay>>;
