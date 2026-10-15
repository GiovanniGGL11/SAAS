import { clerkClient } from '@clerk/nextjs/server';

import { prisma } from '@/lib/db';
import { describeAudit, formatDateTimeAt, systemActorLabel } from '@/lib/audit-describe';
import { utcToCalendarDate } from '@/lib/time';

export type HistoryEntry = {
  id: string;
  createdAt: Date;
  actor: string;
  title: string;
  detail: string | null;
  /** O que foi alterado ("Maria · Corte · 14/10 10:00") e onde abrir. */
  subject: string | null;
  href: string | null;
};

/** Nome das pessoas da equipe pelo id do Clerk; quem não for achado vira "Equipe". */
async function actorNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id) => id.startsWith('user_')))];
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ userId: ids, limit: ids.length });
    for (const user of data) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
      names.set(user.id, name || user.primaryEmailAddress?.emailAddress || 'Equipe');
    }
  } catch {
    // Sem o Clerk, o histórico continua legível: só sem o nome de quem fez.
  }
  return names;
}

/**
 * Histórico de alterações da empresa, do mais novo para o mais antigo. `before` pagina: a próxima
 * página começa antes do último registro mostrado.
 */
export async function listAuditHistory(
  companyId: string,
  timezone: string,
  filter: {
    /** Início do período; ou `days`, contado a partir de agora. */
    since?: Date;
    days?: number;
    before?: Date;
    entityType?: string;
    entityId?: string;
    limit?: number;
  },
): Promise<{ entries: HistoryEntry[]; nextBefore: string | null }> {
  const limit = filter.limit ?? 50;
  const since = filter.since ?? new Date(Date.now() - (filter.days ?? 30) * 86_400_000);
  const rows = await prisma.auditLog.findMany({
    where: {
      companyId,
      createdAt: { gte: since, ...(filter.before ? { lt: filter.before } : {}) },
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const idsOf = (type: string) => [
    ...new Set(page.filter((r) => r.entityType === type).map((r) => r.entityId)),
  ];

  // Uma consulta por tipo, sempre dentro da empresa, para dizer "o quê" em vez de mostrar ids.
  const [appointments, clients, services, products, names] = await Promise.all([
    prisma.appointment.findMany({
      where: { companyId, id: { in: idsOf('Appointment') } },
      select: {
        id: true,
        startAt: true,
        serviceNameSnapshot: true,
        client: { select: { name: true } },
      },
    }),
    prisma.client.findMany({
      where: { companyId, id: { in: idsOf('Client') } },
      select: { id: true, name: true },
    }),
    prisma.service.findMany({
      where: { companyId, id: { in: idsOf('Service') } },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { companyId, id: { in: idsOf('Product') } },
      select: { id: true, name: true },
    }),
    actorNames(page.map((r) => r.userId)),
  ]);
  const appointmentById = new Map(appointments.map((a) => [a.id, a]));
  const nameById = new Map(
    [...clients, ...services, ...products].map((e) => [e.id, e.name] as const),
  );

  const entries = page.map((row): HistoryEntry => {
    const { title, detail } = describeAudit(row, timezone);
    let subject: string | null = null;
    let href: string | null = null;
    if (row.entityType === 'Appointment') {
      const a = appointmentById.get(row.entityId);
      if (a) {
        subject = `${a.client.name} · ${a.serviceNameSnapshot} · ${formatDateTimeAt(a.startAt, timezone)}`;
        const d = utcToCalendarDate(a.startAt, timezone);
        const day = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
        href = `/agenda?data=${day}&agendamento=${a.id}`;
      }
    } else if (nameById.has(row.entityId)) {
      subject = nameById.get(row.entityId)!;
      href =
        row.entityType === 'Client'
          ? `/clientes/${row.entityId}`
          : row.entityType === 'Service'
            ? '/servicos'
            : row.entityType === 'Product'
              ? '/estoque'
              : null;
    }
    return {
      id: row.id,
      createdAt: row.createdAt,
      actor: systemActorLabel(row.userId) ?? names.get(row.userId) ?? 'Equipe',
      title,
      detail,
      subject,
      href,
    };
  });

  return {
    entries,
    nextBefore: rows.length > limit ? page[page.length - 1].createdAt.toISOString() : null,
  };
}
