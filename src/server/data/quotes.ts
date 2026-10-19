import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { addDays, calendarDateToUtc, utcToCalendarDate } from '@/lib/time';
import {
  canonicalQuoteContent,
  lineTotal,
  packageShape,
  quoteContentSchema,
  quoteTotals,
  type QuoteContent,
  type QuoteInput,
  type QuoteItem,
} from '@/lib/quotes';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';
import { createClientPackage } from '@/server/data/package-sessions';
import { createTask } from '@/server/data/tasks';

/*
  Orçamentos com versões.
  - O conteúdo mora em QuoteVersion. Rascunho nunca enviado é corrigido no lugar; depois de
    enviado (ou aprovado), qualquer mudança cria versão nova e volta para Rascunho.
  - Aprovar exige o hash exato da versão mostrada: se o conteúdo mudou no meio, a aprovação falha.
  - A versão aprovada nunca é apagada nem reescrita.
  - Aprovar não é pagar: nenhum lançamento financeiro nasce aqui. A conversão em pacote cria o
    pacote "a lançar" (sem cobrança) e acontece uma vez só, na mesma transação que marca o
    orçamento como convertido.
*/

const TX = { maxWait: 10_000, timeout: 20_000 };
const D = (v: number) => new Prisma.Decimal(v).toDecimalPlaces(2);
/** Link protegido vale no máximo isto (ou até a validade do orçamento, o que vier antes). */
export const QUOTE_LINK_DAYS = 30;

export function hashQuoteContent(content: QuoteContent): string {
  return createHash('sha256').update(canonicalQuoteContent(content)).digest('hex');
}

/** Fim do dia AAAA-MM-DD no fuso da empresa. */
function endOfDay(key: string, timezone: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(calendarDateToUtc(addDays({ year, month, day }, 1), 0, timezone).getTime() - 1);
}

function dateKey(date: Date, timezone: string): string {
  const d = utcToCalendarDate(date, timezone);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

type VersionRow = Prisma.QuoteVersionGetPayload<object>;

/** Conteúdo da versão gravada, no formato da entrada (para hash, edição e duplicação). */
export function versionContent(version: VersionRow, timezone: string): QuoteContent {
  return {
    items: version.items as QuoteItem[],
    discount: Number(version.discount),
    paymentTerms: version.paymentTerms,
    notes: version.notes,
    validUntil: version.validUntil ? dateKey(version.validUntil, timezone) : null,
  };
}

async function assertQuoteRefs(
  db: Prisma.TransactionClient,
  companyId: string,
  input: Pick<QuoteInput, 'clientId' | 'responsibleProfessionalId'> & { items: QuoteItem[] },
) {
  const client = await db.client.findFirst({
    where: { id: input.clientId, companyId },
    select: { id: true },
  });
  if (!client) throw new UserError('Cliente não encontrado.');
  if (input.responsibleProfessionalId) {
    const pro = await db.professional.findFirst({
      where: { id: input.responsibleProfessionalId, companyId },
      select: { id: true },
    });
    if (!pro) throw new UserError('Profissional não encontrado.');
  }
  const serviceIds = input.items.filter((i) => i.kind === 'service').map((i) => i.refId ?? '');
  const productIds = input.items.filter((i) => i.kind === 'product').map((i) => i.refId ?? '');
  if (serviceIds.some((id) => !id) || productIds.some((id) => !id)) {
    throw new UserError('Escolha o serviço ou produto de cada item.');
  }
  if (serviceIds.length) {
    const found = await db.service.count({
      where: { companyId, id: { in: [...new Set(serviceIds)] } },
    });
    if (found !== new Set(serviceIds).size) throw new UserError('Serviço não encontrado.');
  }
  if (productIds.length) {
    const found = await db.product.count({
      where: { companyId, id: { in: [...new Set(productIds)] } },
    });
    if (found !== new Set(productIds).size) throw new UserError('Produto não encontrado.');
  }
}

function versionData(content: QuoteContent, timezone: string) {
  const totals = quoteTotals(content);
  const items = content.items.map((i) => ({
    kind: i.kind,
    refId: i.refId ?? null,
    description: i.description.trim(),
    quantity: i.quantity,
    sessions: i.sessions ?? 1,
    unitPrice: i.unitPrice,
    discount: i.discount ?? 0,
  }));
  return {
    items,
    subtotal: D(totals.subtotal),
    discount: D(totals.discount),
    total: D(totals.total),
    paymentTerms: content.paymentTerms?.trim() || null,
    notes: content.notes?.trim() || null,
    validUntil: content.validUntil ? endOfDay(content.validUntil, timezone) : null,
    contentHash: hashQuoteContent(content),
  };
}

function parseContent(input: unknown): QuoteContent {
  const parsed = quoteContentSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
  return parsed.data;
}

/** Trava a linha do orçamento até o fim da transação (edições e aprovações concorrentes). */
async function lockQuote(tx: Prisma.TransactionClient, companyId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Quote" WHERE id = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  if (!rows.length) throw new UserError('Orçamento não encontrado.');
  const quote = await tx.quote.findUniqueOrThrow({ where: { id } });
  const version = await tx.quoteVersion.findUniqueOrThrow({
    where: { quoteId_version: { quoteId: id, version: quote.currentVersion } },
  });
  return { quote, version };
}

// ---- Criar, editar, duplicar --------------------------------------------------------------------

export async function createQuote(params: {
  companyId: string;
  timezone: string;
  userId: string;
  input: QuoteInput;
  /** manual | ai | automation:<rotina> */
  origin?: string;
}) {
  const content = parseContent(params.input);
  const title = params.input.title.trim();
  if (!title) throw new UserError('Dê um nome ao orçamento.');
  if (content.validUntil && endOfDay(content.validUntil, params.timezone) < new Date()) {
    throw new UserError('A validade precisa ser hoje ou depois.');
  }
  const quote = await prisma.$transaction(async (tx) => {
    await assertQuoteRefs(tx, params.companyId, { ...params.input, items: content.items });
    // Número sequencial por empresa, sem buraco por corrida.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'quote-number:' + params.companyId}))`;
    const last = await tx.quote.aggregate({
      where: { companyId: params.companyId },
      _max: { number: true },
    });
    return tx.quote.create({
      data: {
        companyId: params.companyId,
        clientId: params.input.clientId,
        number: (last._max.number ?? 0) + 1,
        title,
        responsibleProfessionalId: params.input.responsibleProfessionalId || null,
        origin: params.origin ?? 'manual',
        createdByUserId: params.userId,
        versions: {
          create: {
            companyId: params.companyId,
            version: 1,
            createdByUserId: params.userId,
            ...versionData(content, params.timezone),
          },
        },
      },
    });
  }, TX);
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Quote',
    entityId: quote.id,
    action: 'created',
    userId: params.userId,
    metadata: { number: quote.number, origin: quote.origin },
  });
  return quote;
}

/**
 * Altera o conteúdo. `expectedVersion` é a versão que a pessoa estava vendo: se outra pessoa
 * mudou antes, recusa (nada de sobrescrever às cegas).
 */
export async function updateQuote(params: {
  companyId: string;
  timezone: string;
  userId: string;
  id: string;
  expectedVersion: number;
  input: QuoteInput;
}) {
  const content = parseContent(params.input);
  const hash = hashQuoteContent(content);
  const result = await prisma.$transaction(async (tx) => {
    const { quote, version } = await lockQuote(tx, params.companyId, params.id);
    if (quote.status === 'CANCELED')
      throw new UserError('Orçamento cancelado não pode ser alterado.');
    if (quote.convertedAt) {
      throw new UserError('Este orçamento já virou pacote. Para mudar, crie um orçamento novo.');
    }
    if (quote.currentVersion !== params.expectedVersion) {
      throw new UserError(
        'Este orçamento foi alterado por outra pessoa enquanto você editava. Recarregue para ver a versão atual.',
      );
    }
    if (params.input.clientId !== quote.clientId) {
      throw new UserError('O cliente de um orçamento não muda. Duplique para outro cliente.');
    }
    await assertQuoteRefs(tx, params.companyId, { ...params.input, items: content.items });
    const title = params.input.title.trim();
    const sameContent = hash === version.contentHash;
    const meta = {
      title,
      responsibleProfessionalId: params.input.responsibleProfessionalId || null,
    };
    if (sameContent) {
      await tx.quote.update({ where: { id: quote.id }, data: meta });
      return { quote, newVersion: false };
    }
    const untouched = quote.status === 'DRAFT' && !quote.sentAt && quote.approvedVersion === null;
    if (untouched) {
      await tx.quoteVersion.update({
        where: { id: version.id },
        data: versionData(content, params.timezone),
      });
      await tx.quote.update({ where: { id: quote.id }, data: meta });
      return { quote, newVersion: false };
    }
    // Já foi enviado ou aprovado: versão nova, volta para rascunho e derruba os links enviados.
    const next = quote.currentVersion + 1;
    await tx.quoteVersion.create({
      data: {
        companyId: params.companyId,
        quoteId: quote.id,
        version: next,
        createdByUserId: params.userId,
        ...versionData(content, params.timezone),
      },
    });
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        ...meta,
        currentVersion: next,
        status: 'DRAFT',
        shareVersion: { increment: 1 },
        shareExpiresAt: null,
        rejectedAt: null,
        rejectionReason: null,
      },
    });
    return { quote, newVersion: true };
  }, TX);
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Quote',
    entityId: params.id,
    action: 'updated',
    userId: params.userId,
    metadata: { newVersion: result.newVersion },
  });
  return { newVersion: result.newVersion };
}

export async function duplicateQuote(params: {
  companyId: string;
  timezone: string;
  userId: string;
  id: string;
  clientId?: string;
}) {
  const quote = await prisma.quote.findFirst({
    where: { id: params.id, companyId: params.companyId },
  });
  if (!quote) throw new UserError('Orçamento não encontrado.');
  const version = await prisma.quoteVersion.findUniqueOrThrow({
    where: { quoteId_version: { quoteId: quote.id, version: quote.currentVersion } },
  });
  const content = versionContent(version, params.timezone);
  // Validade vencida não é copiada.
  if (content.validUntil && endOfDay(content.validUntil, params.timezone) < new Date()) {
    content.validUntil = null;
  }
  return createQuote({
    companyId: params.companyId,
    timezone: params.timezone,
    userId: params.userId,
    input: {
      ...content,
      clientId: params.clientId ?? quote.clientId,
      title: `${quote.title} (cópia)`.slice(0, 120),
      responsibleProfessionalId: quote.responsibleProfessionalId,
    },
  });
}

// ---- Situação: enviar, aprovar, recusar, cancelar, vencer ---------------------------------------

/** Orçamentos enviados cuja validade passou viram "Vencido" (conferido ao listar e ao aprovar). */
export async function expireStaleQuotes(companyId: string) {
  await prisma.$executeRaw`
    UPDATE "Quote" q SET status = 'EXPIRED', "updatedAt" = now()
    FROM "QuoteVersion" v
    WHERE v."quoteId" = q.id AND v.version = q."currentVersion"
      AND q."companyId" = ${companyId} AND q.status = 'SENT'
      AND v."validUntil" IS NOT NULL AND v."validUntil" < now()`;
}

function isExpired(version: { validUntil: Date | null }) {
  return version.validUntil !== null && version.validUntil.getTime() < Date.now();
}

export async function markQuoteSent(companyId: string, userId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const { quote, version } = await lockQuote(tx, companyId, id);
    if (quote.status !== 'DRAFT' && quote.status !== 'SENT') {
      throw new UserError('Só um rascunho (ou orçamento já enviado) pode ser enviado.');
    }
    if (isExpired(version)) {
      throw new UserError(
        'A validade deste orçamento já passou. Ajuste a validade antes de enviar.',
      );
    }
    await tx.quote.update({
      where: { id: quote.id },
      data: { status: 'SENT', sentAt: quote.sentAt ?? new Date() },
    });
  }, TX);
  await recordAuditLog({ companyId, entityType: 'Quote', entityId: id, action: 'sent', userId });
}

type ApprovalVia = 'staff' | 'client_link' | 'client_portal';

async function approveInTx(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    id: string;
    version: number;
    contentHash: string;
    via: ApprovalVia;
    userId: string;
    note?: string | null;
  },
) {
  const { quote, version } = await lockQuote(tx, params.companyId, params.id);
  if (quote.status === 'APPROVED' && quote.approvedVersion === params.version) {
    return { quote, already: true };
  }
  const allowed = params.via === 'staff' ? ['DRAFT', 'SENT'] : ['SENT'];
  if (!allowed.includes(quote.status)) {
    throw new UserError(
      quote.status === 'EXPIRED'
        ? 'Este orçamento venceu. Peça uma versão atualizada.'
        : 'Este orçamento não está aguardando aprovação.',
    );
  }
  if (quote.currentVersion !== params.version || version.contentHash !== params.contentHash) {
    throw new UserError(
      'O orçamento foi alterado depois que esta tela foi aberta. Confira a versão atual antes de aprovar.',
    );
  }
  if (isExpired(version)) {
    await tx.quote.update({ where: { id: quote.id }, data: { status: 'EXPIRED' } });
    throw new UserError('Este orçamento venceu. Peça uma versão atualizada.');
  }
  const updated = await tx.quote.update({
    where: { id: quote.id },
    data: {
      status: 'APPROVED',
      approvedVersion: version.version,
      approvedHash: version.contentHash,
      approvedAt: new Date(),
      approvedVia: params.via,
      approvedByUserId: params.via === 'staff' ? params.userId : null,
      approvalNote: params.note?.trim() || null,
      rejectedAt: null,
      rejectionReason: null,
    },
  });
  await recordAuditLog(
    {
      companyId: params.companyId,
      entityType: 'Quote',
      entityId: quote.id,
      action: 'approved',
      userId: params.userId,
      metadata: { version: version.version, via: params.via, hash: version.contentHash },
    },
    tx,
  );
  return { quote: updated, already: false };
}

/** A equipe registra a aprovação que o cliente deu (WhatsApp, presencial). */
export async function approveQuote(params: {
  companyId: string;
  userId: string;
  id: string;
  version: number;
  contentHash: string;
  note?: string | null;
}) {
  return prisma.$transaction((tx) => approveInTx(tx, { ...params, via: 'staff' }), TX);
}

export async function rejectQuote(params: {
  companyId: string;
  userId: string;
  id: string;
  reason?: string | null;
  via?: ApprovalVia;
}) {
  await prisma.$transaction(async (tx) => {
    const { quote } = await lockQuote(tx, params.companyId, params.id);
    const allowed = (params.via ?? 'staff') === 'staff' ? ['DRAFT', 'SENT'] : ['SENT'];
    if (!allowed.includes(quote.status)) {
      throw new UserError('Este orçamento não está aguardando resposta.');
    }
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: params.reason?.trim().slice(0, 500) || null,
      },
    });
    await recordAuditLog(
      {
        companyId: params.companyId,
        entityType: 'Quote',
        entityId: quote.id,
        action: 'rejected',
        userId: params.userId,
        metadata: { via: params.via ?? 'staff' },
      },
      tx,
    );
  }, TX);
}

export async function cancelQuote(companyId: string, userId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const { quote } = await lockQuote(tx, companyId, id);
    if (quote.convertedAt) throw new UserError('Orçamento já convertido não pode ser cancelado.');
    if (quote.status === 'CANCELED') return;
    await tx.quote.update({
      where: { id: quote.id },
      data: { status: 'CANCELED', shareVersion: { increment: 1 }, shareExpiresAt: null },
    });
  }, TX);
  await recordAuditLog({
    companyId,
    entityType: 'Quote',
    entityId: id,
    action: 'canceled',
    userId,
  });
}

// ---- Link protegido ------------------------------------------------------------------------------

function secret(): string {
  const value = process.env.BOOKING_LINK_SECRET || process.env.CLERK_SECRET_KEY;
  if (!value) throw new Error('BOOKING_LINK_SECRET não configurado.');
  return value;
}

function sign(id: string, shareVersion: number, exp: number) {
  return createHmac('sha256', secret())
    .update(`quote:${id}:${shareVersion}:${exp}`)
    .digest('base64url')
    .slice(0, 32);
}

export function readQuoteToken(token: string) {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [id, rawVersion, rawExp, sig] = parts;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !/^\d{1,9}$/.test(rawVersion)) return null;
  if (!/^\d{1,12}$/.test(rawExp)) return null;
  const shareVersion = Number(rawVersion);
  const exp = Number(rawExp);
  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(id, shareVersion, exp));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { id, shareVersion, exp };
}

/**
 * Gera um link novo para o cliente ver e responder (derruba os anteriores). Vale até a validade
 * do orçamento ou QUOTE_LINK_DAYS, o que vier antes. O link não leva dado do cliente na URL.
 */
export async function createQuoteShareLink(companyId: string, userId: string, id: string) {
  const token = await prisma.$transaction(async (tx) => {
    const { quote, version } = await lockQuote(tx, companyId, id);
    if (!['DRAFT', 'SENT', 'APPROVED'].includes(quote.status)) {
      throw new UserError('Este orçamento não pode mais ser compartilhado.');
    }
    if (isExpired(version)) throw new UserError('A validade deste orçamento já passou.');
    const limit = Date.now() + QUOTE_LINK_DAYS * 86_400_000;
    const expiresAt = new Date(Math.min(limit, version.validUntil?.getTime() ?? limit));
    const updated = await tx.quote.update({
      where: { id: quote.id },
      data: {
        shareVersion: { increment: 1 },
        shareExpiresAt: expiresAt,
        ...(quote.status === 'DRAFT' ? { status: 'SENT', sentAt: quote.sentAt ?? new Date() } : {}),
      },
    });
    const exp = Math.floor(expiresAt.getTime() / 1000);
    return `${quote.id}.${updated.shareVersion}.${exp}.${sign(quote.id, updated.shareVersion, exp)}`;
  }, TX);
  await recordAuditLog({
    companyId,
    entityType: 'Quote',
    entityId: id,
    action: 'link_created',
    userId,
  });
  return token;
}

export async function revokeQuoteLinks(companyId: string, userId: string, id: string) {
  const result = await prisma.quote.updateMany({
    where: { id, companyId },
    data: { shareVersion: { increment: 1 }, shareExpiresAt: null },
  });
  if (!result.count) throw new UserError('Orçamento não encontrado.');
  await recordAuditLog({
    companyId,
    entityType: 'Quote',
    entityId: id,
    action: 'link_revoked',
    userId,
  });
}

// ---- Leitura -------------------------------------------------------------------------------------

export type QuoteListFilter = { status?: string; clientId?: string };

export async function listQuotes(companyId: string, filter: QuoteListFilter = {}) {
  await expireStaleQuotes(companyId);
  const quotes = await prisma.quote.findMany({
    where: {
      companyId,
      ...(filter.status ? { status: filter.status as never } : {}),
      ...(filter.clientId ? { clientId: filter.clientId } : {}),
    },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { number: 'desc' },
    take: 200,
  });
  if (!quotes.length) return [];
  const versions = await prisma.quoteVersion.findMany({
    where: {
      OR: quotes.map((q) => ({ quoteId: q.id, version: q.currentVersion })),
    },
    select: { quoteId: true, total: true, validUntil: true },
  });
  const byQuote = new Map(versions.map((v) => [v.quoteId, v]));
  return quotes.map((q) => ({
    id: q.id,
    number: q.number,
    title: q.title,
    status: q.status,
    client: q.client,
    currentVersion: q.currentVersion,
    total: Number(byQuote.get(q.id)?.total ?? 0),
    validUntil: byQuote.get(q.id)?.validUntil?.toISOString() ?? null,
    converted: Boolean(q.convertedRefId),
    origin: q.origin,
    updatedAt: q.updatedAt.toISOString(),
  }));
}

export type QuoteListItem = Awaited<ReturnType<typeof listQuotes>>[number];

function serializeVersion(v: VersionRow) {
  return {
    version: v.version,
    items: (v.items as QuoteItem[]).map((i) => ({ ...i, lineTotal: lineTotal(i) })),
    subtotal: Number(v.subtotal),
    discount: Number(v.discount),
    total: Number(v.total),
    paymentTerms: v.paymentTerms,
    notes: v.notes,
    validUntil: v.validUntil?.toISOString() ?? null,
    contentHash: v.contentHash,
    createdAt: v.createdAt.toISOString(),
  };
}

export async function getQuoteDetail(companyId: string, id: string, timezone: string) {
  await expireStaleQuotes(companyId);
  const quote = await prisma.quote.findFirst({
    where: { id, companyId },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      versions: { orderBy: { version: 'desc' } },
      tasks: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!quote) throw new UserError('Orçamento não encontrado.');
  const current = quote.versions.find((v) => v.version === quote.currentVersion)!;
  const pkg = quote.convertedRefId
    ? await prisma.clientPackage.findFirst({
        where: { id: quote.convertedRefId, companyId },
        select: { id: true, nameSnapshot: true },
      })
    : null;
  return {
    id: quote.id,
    number: quote.number,
    title: quote.title,
    status: quote.status,
    origin: quote.origin,
    client: quote.client,
    responsibleProfessionalId: quote.responsibleProfessionalId,
    currentVersion: quote.currentVersion,
    current: serializeVersion(current),
    content: versionContent(current, timezone),
    history: quote.versions.map(serializeVersion),
    approved: quote.approvedVersion
      ? {
          version: quote.approvedVersion,
          at: quote.approvedAt?.toISOString() ?? null,
          via: quote.approvedVia,
          note: quote.approvalNote,
          isCurrent: quote.approvedVersion === quote.currentVersion,
        }
      : null,
    rejected: quote.rejectedAt
      ? { at: quote.rejectedAt.toISOString(), reason: quote.rejectionReason }
      : null,
    sentAt: quote.sentAt?.toISOString() ?? null,
    shareActive: Boolean(quote.shareExpiresAt && quote.shareExpiresAt > new Date()),
    shareExpiresAt: quote.shareExpiresAt?.toISOString() ?? null,
    converted: quote.convertedAt
      ? {
          at: quote.convertedAt.toISOString(),
          kind: quote.convertedKind,
          packageId: pkg?.id ?? null,
          packageName: pkg?.nameSnapshot ?? null,
        }
      : null,
    canConvert: packageShape(versionContent(current, timezone)),
    tasks: quote.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueAt: t.dueAt?.toISOString() ?? null,
    })),
  };
}

export type QuoteDetail = Awaited<ReturnType<typeof getQuoteDetail>>;

// ---- Converter em pacote e acompanhar ------------------------------------------------------------

/**
 * Converte a versão APROVADA em pacote do cliente, uma vez só: o pacote é criado e o orçamento
 * marcado como convertido na mesma transação; uma segunda tentativa (clique duplo, outra aba)
 * desfaz o próprio pacote e recusa. O pacote nasce "a lançar": aprovar não é pagar.
 */
export async function convertQuoteToPackage(params: {
  companyId: string;
  timezone: string;
  userId: string;
  id: string;
}) {
  const quote = await prisma.quote.findFirst({
    where: { id: params.id, companyId: params.companyId },
  });
  if (!quote) throw new UserError('Orçamento não encontrado.');
  if (quote.convertedAt) throw new UserError('Este orçamento já foi convertido em pacote.');
  if (quote.status !== 'APPROVED' || quote.approvedVersion !== quote.currentVersion) {
    throw new UserError('Só a versão aprovada pode virar pacote. Registre a aprovação primeiro.');
  }
  const version = await prisma.quoteVersion.findUniqueOrThrow({
    where: { quoteId_version: { quoteId: quote.id, version: quote.approvedVersion } },
  });
  if (version.contentHash !== quote.approvedHash) {
    throw new UserError('O conteúdo aprovado não confere. Peça uma nova aprovação.');
  }
  const content = versionContent(version, params.timezone);
  const shape = packageShape(content);
  if (!shape.ok) throw new UserError(shape.reason);

  const pkg = await createClientPackage({
    companyId: params.companyId,
    clientId: quote.clientId,
    userId: params.userId,
    name: quote.title,
    serviceId: shape.serviceId,
    sessionsTotal: shape.sessions,
    price: Number(version.total),
    contractedAt: new Date(),
    validUntil: null,
    responsibleProfessionalId: quote.responsibleProfessionalId,
    notes: `Criado do orçamento #${quote.number} (versão ${version.version}).`,
    requireSignature: false,
    payment: { kind: 'later' },
    afterCreate: async (tx, created) => {
      const claimed = await tx.quote.updateMany({
        where: {
          id: quote.id,
          companyId: params.companyId,
          convertedAt: null,
          status: 'APPROVED',
          approvedVersion: version.version,
        },
        data: {
          convertedAt: new Date(),
          convertedKind: 'package',
          convertedRefId: created.id,
          convertedByUserId: params.userId,
        },
      });
      if (claimed.count === 0) {
        throw new UserError('Este orçamento já foi convertido em pacote.');
      }
    },
  });
  await recordAuditLog({
    companyId: params.companyId,
    entityType: 'Quote',
    entityId: quote.id,
    action: 'converted',
    userId: params.userId,
    metadata: { kind: 'package', packageId: pkg.id, version: version.version },
  });
  return pkg;
}

export async function createQuoteFollowUp(params: {
  companyId: string;
  userId: string;
  id: string;
  dueAt: Date | null;
  title?: string | null;
}) {
  const quote = await prisma.quote.findFirst({
    where: { id: params.id, companyId: params.companyId },
    include: { client: { select: { name: true } } },
  });
  if (!quote) throw new UserError('Orçamento não encontrado.');
  return createTask(params.companyId, params.userId, {
    title: params.title?.trim() || `Retornar orçamento #${quote.number} — ${quote.client.name}`,
    dueAt: params.dueAt,
    clientId: quote.clientId,
    quoteId: quote.id,
  });
}

// ---- Lado do cliente (link protegido e área do cliente) ------------------------------------------

/** O que o cliente vê: itens, valores e condições. Nunca custo, comissão ou nota interna. */
function clientView(
  quote: Prisma.QuoteGetPayload<{ include: { company: { select: { name: true } } } }>,
  version: VersionRow,
) {
  return {
    id: quote.id,
    number: quote.number,
    title: quote.title,
    companyName: quote.company.name,
    status: quote.status,
    version: version.version,
    contentHash: version.contentHash,
    items: (version.items as QuoteItem[]).map((i) => ({
      description: i.description,
      quantity: i.quantity,
      sessions: i.sessions ?? 1,
      unitPrice: i.unitPrice,
      discount: i.discount ?? 0,
      lineTotal: lineTotal(i),
    })),
    subtotal: Number(version.subtotal),
    discount: Number(version.discount),
    total: Number(version.total),
    paymentTerms: version.paymentTerms,
    notes: version.notes,
    validUntil: version.validUntil?.toISOString() ?? null,
    approvedAt:
      quote.approvedVersion === version.version ? (quote.approvedAt?.toISOString() ?? null) : null,
  };
}

export type ClientQuoteView = ReturnType<typeof clientView>;

export type QuoteLinkProblem = 'invalid' | 'expired' | 'revoked';

export async function getQuoteByToken(
  token: string,
): Promise<{ quote: ClientQuoteView } | { problem: QuoteLinkProblem }> {
  const parsed = readQuoteToken(token);
  if (!parsed) return { problem: 'invalid' };
  const quote = await prisma.quote.findFirst({
    where: { id: parsed.id, company: { deletedAt: null } },
    include: { company: { select: { name: true } } },
  });
  if (!quote) return { problem: 'invalid' };
  if (quote.shareVersion !== parsed.shareVersion || quote.status === 'CANCELED') {
    return { problem: 'revoked' };
  }
  if (parsed.exp * 1000 < Date.now()) return { problem: 'expired' };
  await expireStaleQuotes(quote.companyId);
  const fresh = await prisma.quote.findUniqueOrThrow({
    where: { id: quote.id },
    include: { company: { select: { name: true } } },
  });
  const version = await prisma.quoteVersion.findUniqueOrThrow({
    where: { quoteId_version: { quoteId: quote.id, version: fresh.currentVersion } },
  });
  return { quote: clientView(fresh, version) };
}

async function quoteFromToken(token: string) {
  const parsed = readQuoteToken(token);
  if (!parsed || parsed.exp * 1000 < Date.now()) {
    throw new UserError('Este link expirou. Peça um novo à empresa.');
  }
  const quote = await prisma.quote.findFirst({
    where: { id: parsed.id, shareVersion: parsed.shareVersion, company: { deletedAt: null } },
  });
  if (!quote) throw new UserError('Este link não vale mais. Peça um novo à empresa.');
  return quote;
}

export async function respondQuoteByToken(
  token: string,
  answer:
    { approve: true; version: number; contentHash: string } | { approve: false; reason?: string },
) {
  const quote = await quoteFromToken(token);
  if (answer.approve) {
    return prisma.$transaction(
      (tx) =>
        approveInTx(tx, {
          companyId: quote.companyId,
          id: quote.id,
          version: answer.version,
          contentHash: answer.contentHash,
          via: 'client_link',
          userId: 'client-quote-link',
        }),
      TX,
    );
  }
  await rejectQuote({
    companyId: quote.companyId,
    userId: 'client-quote-link',
    id: quote.id,
    reason: answer.reason,
    via: 'client_link',
  });
}

/** Orçamentos do próprio cliente na área do cliente (enviados em diante; rascunho não aparece). */
export async function listClientQuotes(companyId: string, clientId: string) {
  await expireStaleQuotes(companyId);
  const quotes = await prisma.quote.findMany({
    where: { companyId, clientId, status: { in: ['SENT', 'APPROVED', 'REJECTED', 'EXPIRED'] } },
    include: { company: { select: { name: true } } },
    orderBy: { number: 'desc' },
    take: 20,
  });
  const views: ClientQuoteView[] = [];
  for (const quote of quotes) {
    const version = await prisma.quoteVersion.findUniqueOrThrow({
      where: { quoteId_version: { quoteId: quote.id, version: quote.currentVersion } },
    });
    views.push(clientView(quote, version));
  }
  return views;
}

export async function respondQuoteFromPortal(
  session: { id: string; company: { id: string } },
  quoteId: string,
  answer:
    { approve: true; version: number; contentHash: string } | { approve: false; reason?: string },
) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, companyId: session.company.id, clientId: session.id },
    select: { id: true },
  });
  if (!quote) throw new UserError('Orçamento não encontrado.');
  if (answer.approve) {
    return prisma.$transaction(
      (tx) =>
        approveInTx(tx, {
          companyId: session.company.id,
          id: quote.id,
          version: answer.version,
          contentHash: answer.contentHash,
          via: 'client_portal',
          userId: 'client-portal',
        }),
      TX,
    );
  }
  await rejectQuote({
    companyId: session.company.id,
    userId: 'client-portal',
    id: quote.id,
    reason: answer.reason,
    via: 'client_portal',
  });
}
