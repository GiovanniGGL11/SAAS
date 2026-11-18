import { prisma } from '@/lib/db';
import type { QuoteItem } from '@/lib/quotes';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Plano de tratamento do paciente (prontuário, fase 2): os procedimentos dos orçamentos
  aprovados, com quantas sessões foram feitas. Vem da VERSÃO APROVADA de cada orçamento (mudar o
  orçamento depois não mexe no plano até ele ser aprovado de novo).

  - Itens de serviço e itens livres entram (produto não é procedimento).
  - Total de sessões do item = quantidade × sessões por unidade.
  - Orçamento convertido em pacote: o andamento é o do pacote (sessão usada na comanda); não se
    marca à mão para não contar duas vezes.
  - Os demais: cada sessão feita é marcada no prontuário (sozinha ou junto com a evolução).
*/

export type PlanItem = {
  quoteId: string;
  itemIndex: number;
  description: string;
  total: number;
  done: number;
  /** Andamento pelo pacote (convertido): marcar à mão fica desligado. */
  viaPackage: boolean;
  history: { id: string; doneAt: Date; by: string; note: string | null }[];
};

export type PlanQuote = {
  quoteId: string;
  number: number;
  title: string;
  approvedAt: Date | null;
  packageName: string | null;
  items: PlanItem[];
};

const sessionsOf = (item: QuoteItem) =>
  Math.max(1, Number(item.quantity) || 1) * Math.max(1, Number(item.sessions) || 1);

export async function getTreatmentPlan(companyId: string, clientId: string): Promise<PlanQuote[]> {
  const quotes = await prisma.quote.findMany({
    where: {
      companyId,
      clientId,
      approvedVersion: { not: null },
      status: { notIn: ['CANCELED', 'REJECTED'] },
    },
    orderBy: { approvedAt: 'desc' },
    select: {
      id: true,
      number: true,
      title: true,
      approvedAt: true,
      approvedVersion: true,
      convertedKind: true,
      convertedRefId: true,
      versions: { select: { version: true, items: true } },
    },
  });
  if (quotes.length === 0) return [];

  const packageIds = quotes
    .filter((q) => q.convertedKind === 'package' && q.convertedRefId)
    .map((q) => q.convertedRefId!);
  const [packages, records] = await Promise.all([
    packageIds.length
      ? prisma.clientPackage.findMany({
          where: { companyId, id: { in: packageIds } },
          select: { id: true, nameSnapshot: true, sessionsUsed: true, sessionsTotal: true },
        })
      : Promise.resolve([]),
    prisma.treatmentProcedure.findMany({
      where: { companyId, clientId, quoteId: { in: quotes.map((q) => q.id) } },
      orderBy: { doneAt: 'desc' },
      select: {
        id: true,
        quoteId: true,
        itemIndex: true,
        doneAt: true,
        doneByName: true,
        note: true,
      },
    }),
  ]);
  const packageById = new Map(packages.map((p) => [p.id, p]));

  const plan: PlanQuote[] = [];
  for (const q of quotes) {
    const version = q.versions.find((v) => v.version === q.approvedVersion);
    const items = (Array.isArray(version?.items) ? version.items : []) as unknown as QuoteItem[];
    const pkg = q.convertedKind === 'package' ? packageById.get(q.convertedRefId ?? '') : undefined;
    const planItems: PlanItem[] = [];
    items.forEach((item, index) => {
      if (item.kind === 'product') return;
      const history = records
        .filter((r) => r.quoteId === q.id && r.itemIndex === index)
        .map((r) => ({ id: r.id, doneAt: r.doneAt, by: r.doneByName, note: r.note }));
      planItems.push({
        quoteId: q.id,
        itemIndex: index,
        description: item.description,
        total: pkg ? pkg.sessionsTotal : sessionsOf(item),
        done: pkg ? pkg.sessionsUsed : history.length,
        viaPackage: Boolean(pkg),
        history: pkg ? [] : history,
      });
    });
    if (planItems.length) {
      plan.push({
        quoteId: q.id,
        number: q.number,
        title: q.title,
        approvedAt: q.approvedAt,
        packageName: pkg?.nameSnapshot ?? null,
        items: planItems,
      });
    }
  }
  return plan;
}

/** Quantas sessões ainda faltam no plano (para o cabeçalho do prontuário). */
export function pendingSessions(plan: PlanQuote[]) {
  return plan.reduce(
    (sum, q) => sum + q.items.reduce((s, i) => s + Math.max(0, i.total - i.done), 0),
    0,
  );
}

/** Marca uma sessão feita de um procedimento do plano (não passa do total). */
export async function markProcedureDone(params: {
  companyId: string;
  clientId: string;
  quoteId: string;
  itemIndex: number;
  userId: string;
  userName: string;
  appointmentId?: string | null;
  clinicalNoteId?: string | null;
  note?: string | null;
}) {
  const plan = await getTreatmentPlan(params.companyId, params.clientId);
  const item = plan
    .find((q) => q.quoteId === params.quoteId)
    ?.items.find((i) => i.itemIndex === params.itemIndex);
  if (!item) throw new UserError('Procedimento não encontrado no plano deste paciente.');
  if (item.viaPackage) {
    throw new UserError(
      'Este procedimento virou pacote: a sessão conta pela comanda ("Usar sessão do pacote").',
    );
  }
  if (item.done >= item.total) {
    throw new UserError(`Todas as ${item.total} sessões de "${item.description}" já foram feitas.`);
  }
  const row = await prisma.treatmentProcedure.create({
    data: {
      companyId: params.companyId,
      clientId: params.clientId,
      quoteId: params.quoteId,
      itemIndex: params.itemIndex,
      appointmentId: params.appointmentId ?? null,
      clinicalNoteId: params.clinicalNoteId ?? null,
      note: params.note?.trim().slice(0, 500) || null,
      doneByUserId: params.userId,
      doneByName: params.userName,
    },
    select: { id: true },
  });
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'TreatmentProcedure',
    entityId: row.id,
    action: 'created',
    userId: params.userId,
    metadata: { quoteId: params.quoteId, item: item.description, session: item.done + 1 },
  });
  return { id: row.id, done: item.done + 1, total: item.total };
}

/** Desfaz uma sessão marcada por engano (fica registrado no histórico de alterações). */
export async function undoProcedureDone(
  companyId: string,
  clientId: string,
  id: string,
  userId: string,
) {
  const row = await prisma.treatmentProcedure.findFirst({
    where: { id, companyId, clientId },
    select: { id: true, quoteId: true, itemIndex: true, doneAt: true },
  });
  if (!row) throw new UserError('Sessão não encontrada.');
  await prisma.treatmentProcedure.delete({ where: { id: row.id } });
  await recordAuditLog({
    companyId,
    entityType: 'TreatmentProcedure',
    entityId: row.id,
    action: 'deleted',
    userId,
    metadata: { quoteId: row.quoteId, itemIndex: row.itemIndex, doneAt: row.doneAt.toISOString() },
  });
}
