import { z } from 'zod';

/*
  Orçamentos: regras puras (sem banco), usadas pela tela, pelo servidor e pelo assistente.
  Valores em reais com 2 casas; o servidor recalcula tudo — total enviado pelo navegador é ignorado.
*/

export const QUOTE_STATUS_LABEL = {
  DRAFT: 'Rascunho',
  SENT: 'Enviado',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  EXPIRED: 'Vencido',
  CANCELED: 'Cancelado',
} as const;

export type QuoteStatusValue = keyof typeof QUOTE_STATUS_LABEL;

export const quoteItemSchema = z.object({
  /** service: serviço do catálogo (refId); product: produto do estoque; custom: texto livre. */
  kind: z.enum(['service', 'product', 'custom']),
  refId: z.string().max(64).nullish(),
  description: z.string().trim().min(1, 'Descreva o item.').max(200),
  quantity: z.number().int().min(1).max(1000),
  /** Sessões por unidade (serviços). 1 = atendimento avulso. */
  sessions: z.number().int().min(1).max(200).default(1),
  unitPrice: z.number().min(0).max(1_000_000),
  /** Desconto em reais neste item. */
  discount: z.number().min(0).max(1_000_000).default(0),
});

export type QuoteItem = z.infer<typeof quoteItemSchema>;

export const quoteContentSchema = z.object({
  items: z.array(quoteItemSchema).min(1, 'Inclua ao menos um item.').max(30),
  /** Desconto geral em reais, além dos descontos por item. */
  discount: z.number().min(0).max(1_000_000).default(0),
  paymentTerms: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  /** AAAA-MM-DD (fim do dia no fuso da empresa). */
  validUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});

export type QuoteContent = z.infer<typeof quoteContentSchema>;

export const quoteInputSchema = quoteContentSchema.extend({
  clientId: z.string().min(1).max(64),
  title: z.string().trim().min(1, 'Dê um nome ao orçamento.').max(120),
  responsibleProfessionalId: z.string().max(64).nullish(),
});

export type QuoteInput = z.infer<typeof quoteInputSchema>;

const cents = (value: number) => Math.round(value * 100);

export function lineTotal(item: Pick<QuoteItem, 'quantity' | 'unitPrice' | 'discount'>): number {
  return Math.max(0, cents(item.quantity * item.unitPrice) - cents(item.discount)) / 100;
}

export type QuoteTotals = { subtotal: number; discount: number; total: number };

/** Subtotal = soma das linhas (já com o desconto de cada item); total = subtotal − desconto geral. */
export function quoteTotals(content: Pick<QuoteContent, 'items' | 'discount'>): QuoteTotals {
  const subtotalCents = content.items.reduce((sum, item) => sum + cents(lineTotal(item)), 0);
  const discountCents = Math.min(cents(content.discount ?? 0), subtotalCents);
  return {
    subtotal: subtotalCents / 100,
    discount: discountCents / 100,
    total: (subtotalCents - discountCents) / 100,
  };
}

/** Desconto total do orçamento em % do valor cheio (para o limite das Preferências do negócio). */
export function discountPercent(content: Pick<QuoteContent, 'items' | 'discount'>): number {
  const full = content.items.reduce((sum, i) => sum + cents(i.quantity * i.unitPrice), 0);
  if (full <= 0) return 0;
  const final = cents(quoteTotals(content).total);
  return Math.round(((full - final) / full) * 1000) / 10;
}

/** Forma canônica do conteúdo: a mesma entrada sempre gera o mesmo texto (e o mesmo hash). */
export function canonicalQuoteContent(content: QuoteContent) {
  return JSON.stringify({
    items: content.items.map((i) => ({
      kind: i.kind,
      refId: i.refId ?? null,
      description: i.description.trim(),
      quantity: i.quantity,
      sessions: i.sessions ?? 1,
      unitPrice: cents(i.unitPrice),
      discount: cents(i.discount ?? 0),
    })),
    discount: cents(content.discount ?? 0),
    paymentTerms: content.paymentTerms?.trim() || null,
    notes: content.notes?.trim() || null,
    validUntil: content.validUntil ?? null,
  });
}

/** Sessões do pacote que este orçamento vira (um serviço só; sessões × quantidade). */
export function packageShape(
  content: Pick<QuoteContent, 'items'>,
):
  | { ok: true; serviceId: string; sessions: number; description: string }
  | { ok: false; reason: string } {
  const services = content.items.filter((i) => i.kind === 'service');
  if (services.length !== 1 || content.items.length !== 1) {
    return {
      ok: false,
      reason: 'Para virar pacote, o orçamento precisa ter um único item: o serviço com as sessões.',
    };
  }
  const [item] = services;
  if (!item.refId) return { ok: false, reason: 'O item precisa ser um serviço do catálogo.' };
  const sessions = (item.sessions ?? 1) * item.quantity;
  if (sessions < 2) {
    return { ok: false, reason: 'Pacote precisa de pelo menos 2 sessões.' };
  }
  return { ok: true, serviceId: item.refId, sessions, description: item.description };
}
