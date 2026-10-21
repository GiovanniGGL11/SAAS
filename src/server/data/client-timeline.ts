import { prisma } from '@/lib/db';

/*
  Linha do tempo do cliente: lê cada fonte oficial (agenda, orçamentos, financeiro, tarefas,
  fichas, CRM, serviços em andamento, avaliações, histórico de alterações) e só aponta para o
  registro de origem — nada é copiado. Permissões por evento:
  - valores em dinheiro só para quem vê o financeiro (administrador);
  - fichas: só nome e situação (as respostas ficam na ficha, com a permissão própria);
  - "interno" marca o que é da equipe; "compartilhável" o que o cliente também vê.
*/

export type TimelineEvent = {
  id: string;
  at: string;
  kind:
    | 'appointment'
    | 'quote'
    | 'payment'
    | 'sale'
    | 'task'
    | 'document'
    | 'interaction'
    | 'job'
    | 'review'
    | 'change';
  title: string;
  detail: string | null;
  href: string | null;
  /** Valor em reais — só para quem vê o financeiro. */
  amount: number | null;
  visibility: 'internal' | 'shared';
};

const STATUS_APPT: Record<string, string> = {
  SCHEDULED: 'agendado',
  CONFIRMED: 'confirmado',
  IN_PROGRESS: 'em atendimento',
  DONE: 'concluído',
  CANCELED: 'cancelado',
  NO_SHOW: 'faltou',
};
const STATUS_QUOTE: Record<string, string> = {
  DRAFT: 'rascunho',
  SENT: 'enviado',
  APPROVED: 'aprovado',
  REJECTED: 'recusado',
  EXPIRED: 'vencido',
  CANCELED: 'cancelado',
};

export async function getClientTimeline(
  companyId: string,
  clientId: string,
  viewer: { isAdmin: boolean },
  limit = 150,
) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, companyId },
    select: { id: true },
  });
  if (!client) return null;
  const take = 60;
  const [appointments, quotes, transactions, tasks, entries, oppEvents, jobs, reviews, changes] =
    await Promise.all([
      prisma.appointment.findMany({
        where: { companyId, clientId },
        select: {
          id: true,
          startAt: true,
          status: true,
          serviceNameSnapshot: true,
          priceSnapshot: true,
          professional: { select: { name: true } },
        },
        orderBy: { startAt: 'desc' },
        take,
      }),
      prisma.quote.findMany({
        where: { companyId, clientId },
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          createdAt: true,
          approvedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      viewer.isAdmin
        ? prisma.transaction.findMany({
            where: { companyId, clientId, type: 'INCOME' },
            select: {
              id: true,
              description: true,
              amount: true,
              status: true,
              createdAt: true,
              paidAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take,
          })
        : Promise.resolve([]),
      prisma.task.findMany({
        where: { companyId, clientId },
        select: { id: true, title: true, status: true, createdAt: true, completedAt: true },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.formEntry.findMany({
        where: { companyId, clientId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          submittedAt: true,
          releasedToClientAt: true,
          template: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.opportunityEvent.findMany({
        where: {
          companyId,
          opportunity: { clientId },
          kind: { in: ['note', 'call', 'message', 'meeting', 'email', 'won', 'lost', 'created'] },
        },
        select: {
          id: true,
          kind: true,
          body: true,
          createdAt: true,
          opportunity: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.job.findMany({
        where: { companyId, clientId },
        select: {
          id: true,
          title: true,
          createdAt: true,
          completedAt: true,
          stage: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.review.findMany({
        where: { companyId, clientId },
        select: { id: true, rating: true, comment: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.auditLog.findMany({
        where: { companyId, entityType: 'Client', entityId: clientId },
        select: { id: true, action: true, userId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

  const events: TimelineEvent[] = [];
  for (const a of appointments) {
    events.push({
      id: `appointment:${a.id}`,
      at: a.startAt.toISOString(),
      kind: 'appointment',
      title: a.serviceNameSnapshot,
      detail: `${STATUS_APPT[a.status] ?? a.status} · ${a.professional.name}`,
      href: `/agenda/atendimento/${a.id}`,
      amount: viewer.isAdmin ? Number(a.priceSnapshot) : null,
      visibility: 'shared',
    });
  }
  for (const q of quotes) {
    events.push({
      id: `quote:${q.id}`,
      at: (q.approvedAt ?? q.createdAt).toISOString(),
      kind: 'quote',
      title: `Orçamento #${q.number} ${q.title}`,
      detail: STATUS_QUOTE[q.status] ?? q.status,
      href: `/comercial?aba=orcamentos&id=${q.id}`,
      amount: null,
      visibility: q.status === 'DRAFT' ? 'internal' : 'shared',
    });
  }
  for (const t of transactions) {
    const paid = t.status === 'PAID';
    events.push({
      id: `transaction:${t.id}`,
      at: (t.paidAt ?? t.createdAt).toISOString(),
      kind: paid ? 'payment' : 'sale',
      title: t.description,
      detail: paid ? 'recebido' : t.status === 'PENDING' ? 'a receber' : 'cancelado/estornado',
      href: '/financeiro',
      amount: Number(t.amount),
      visibility: 'internal',
    });
  }
  for (const t of tasks) {
    events.push({
      id: `task:${t.id}`,
      at: (t.completedAt ?? t.createdAt).toISOString(),
      kind: 'task',
      title: t.title,
      detail: t.status === 'DONE' ? 'concluída' : t.status === 'CANCELED' ? 'cancelada' : 'aberta',
      href: `/atividades?tarefa=${t.id}`,
      amount: null,
      visibility: 'internal',
    });
  }
  for (const e of entries) {
    events.push({
      id: `document:${e.id}`,
      at: (e.submittedAt ?? e.createdAt).toISOString(),
      kind: 'document',
      title: e.template.name,
      detail:
        e.status === 'REQUESTED'
          ? 'pedida'
          : e.status === 'DRAFT'
            ? 'rascunho'
            : e.status === 'SUBMITTED'
              ? 'enviada'
              : 'revisada',
      href: `/clientes/${clientId}?aba=fichas`,
      amount: null,
      visibility: e.releasedToClientAt ? 'shared' : 'internal',
    });
  }
  for (const e of oppEvents) {
    events.push({
      id: `interaction:${e.id}`,
      at: e.createdAt.toISOString(),
      kind: 'interaction',
      title: `${e.opportunity.title}: ${e.kind === 'won' ? 'ganha' : e.kind === 'lost' ? 'perdida' : e.kind === 'created' ? 'oportunidade criada' : 'interação'}`,
      detail: e.body,
      href: `/comercial?aba=oportunidades&oportunidade=${e.opportunity.id}`,
      amount: null,
      visibility: 'internal',
    });
  }
  for (const j of jobs) {
    events.push({
      id: `job:${j.id}`,
      at: (j.completedAt ?? j.createdAt).toISOString(),
      kind: 'job',
      title: j.title,
      detail: j.stage.name,
      href: '/atividades?aba=servicos',
      amount: null,
      visibility: 'internal',
    });
  }
  for (const r of reviews) {
    events.push({
      id: `review:${r.id}`,
      at: r.createdAt.toISOString(),
      kind: 'review',
      title: `Avaliação ${r.rating}★`,
      detail: r.comment,
      href: '/campanhas?aba=avaliacoes',
      amount: null,
      visibility: 'internal',
    });
  }
  for (const c of changes) {
    events.push({
      id: `change:${c.id}`,
      at: c.createdAt.toISOString(),
      kind: 'change',
      title: c.action === 'created' ? 'Cadastro criado' : 'Cadastro alterado',
      detail: c.userId === 'client-portal' ? 'pelo próprio cliente' : null,
      href: null,
      amount: null,
      visibility: 'internal',
    });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
