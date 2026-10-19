import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Tarefas de acompanhamento: retornar um orçamento, oferecer renovação de pacote, ligar para quem
  não concluiu o agendamento. Criadas à mão, pelo assistente (com aprovação) ou por rotinas — que
  usam `dedupeKey` para nunca repetir a mesma tarefa.
*/

type Db = Prisma.TransactionClient | typeof prisma;

export type TaskInput = {
  title: string;
  details?: string | null;
  dueAt?: Date | null;
  clientId?: string | null;
  quoteId?: string | null;
  clientPackageId?: string | null;
  appointmentId?: string | null;
  origin?: string;
  dedupeKey?: string | null;
  assignedUserId?: string | null;
};

const taskInclude = {
  client: { select: { id: true, name: true, phone: true } },
  quote: { select: { id: true, number: true, title: true, status: true } },
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

async function assertRefs(db: Db, companyId: string, input: TaskInput) {
  const [client, quote, pkg, appointment] = await Promise.all([
    input.clientId
      ? db.client.findFirst({ where: { id: input.clientId, companyId }, select: { id: true } })
      : null,
    input.quoteId
      ? db.quote.findFirst({ where: { id: input.quoteId, companyId }, select: { id: true } })
      : null,
    input.clientPackageId
      ? db.clientPackage.findFirst({
          where: { id: input.clientPackageId, companyId },
          select: { id: true },
        })
      : null,
    input.appointmentId
      ? db.appointment.findFirst({
          where: { id: input.appointmentId, companyId },
          select: { id: true },
        })
      : null,
  ]);
  if (input.clientId && !client) throw new UserError('Cliente não encontrado.');
  if (input.quoteId && !quote) throw new UserError('Orçamento não encontrado.');
  if (input.clientPackageId && !pkg) throw new UserError('Pacote não encontrado.');
  if (input.appointmentId && !appointment) throw new UserError('Atendimento não encontrado.');
}

/**
 * Cria a tarefa. Com `dedupeKey`, é idempotente: se já existe (aberta ou não), devolve a existente
 * em vez de duplicar — rotina rodando duas vezes, clique duplo.
 */
export async function createTask(
  companyId: string,
  userId: string,
  input: TaskInput,
  db: Db = prisma,
): Promise<{ task: TaskWithRelations; created: boolean }> {
  const title = input.title.trim();
  if (!title || title.length > 160) throw new UserError('Dê um título curto à tarefa.');
  await assertRefs(db, companyId, input);
  if (input.dedupeKey) {
    const existing = await db.task.findUnique({
      where: { companyId_dedupeKey: { companyId, dedupeKey: input.dedupeKey } },
      include: taskInclude,
    });
    if (existing) return { task: existing, created: false };
  }
  try {
    const task = await db.task.create({
      data: {
        companyId,
        title,
        details: input.details?.trim() || null,
        dueAt: input.dueAt ?? null,
        clientId: input.clientId ?? null,
        quoteId: input.quoteId ?? null,
        clientPackageId: input.clientPackageId ?? null,
        appointmentId: input.appointmentId ?? null,
        origin: input.origin ?? 'manual',
        dedupeKey: input.dedupeKey ?? null,
        assignedUserId: input.assignedUserId ?? null,
        createdByUserId: userId,
      },
      include: taskInclude,
    });
    return { task, created: true };
  } catch (error) {
    // Corrida com outra execução da mesma rotina: a outra criou primeiro.
    if (
      input.dedupeKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await db.task.findUniqueOrThrow({
        where: { companyId_dedupeKey: { companyId, dedupeKey: input.dedupeKey } },
        include: taskInclude,
      });
      return { task: existing, created: false };
    }
    throw error;
  }
}

export async function listTasks(
  companyId: string,
  filter: { status?: 'OPEN' | 'DONE' | 'CANCELED'; clientId?: string; quoteId?: string } = {},
  limit = 100,
): Promise<TaskWithRelations[]> {
  return prisma.task.findMany({
    where: {
      companyId,
      status: filter.status ?? 'OPEN',
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
      ...(filter.quoteId ? { quoteId: filter.quoteId } : {}),
    },
    include: taskInclude,
    // Sem prazo vai para o fim; mais antigas primeiro.
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: limit,
  });
}

export async function setTaskStatus(
  companyId: string,
  userId: string,
  id: string,
  status: 'DONE' | 'CANCELED' | 'OPEN',
) {
  const result = await prisma.task.updateMany({
    where: { id, companyId, status: status === 'OPEN' ? { not: 'OPEN' } : 'OPEN' },
    data:
      status === 'DONE'
        ? { status, completedAt: new Date(), completedByUserId: userId }
        : { status, completedAt: null, completedByUserId: null },
  });
  if (result.count === 0) throw new UserError('Essa tarefa já foi atualizada.');
  await recordAuditLog({
    companyId,
    entityType: 'Task',
    entityId: id,
    action: status === 'DONE' ? 'completed' : status === 'CANCELED' ? 'canceled' : 'restored',
    userId,
  });
}

export async function countOpenTasksDue(companyId: string, until: Date) {
  return prisma.task.count({
    where: { companyId, status: 'OPEN', OR: [{ dueAt: null }, { dueAt: { lte: until } }] },
  });
}
