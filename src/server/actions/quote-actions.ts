'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { assertFeature } from '@/server/billing/features';
import { rateLimit } from '@/server/rate-limit';
import { quoteInputSchema } from '@/lib/quotes';
import { whatsappLink } from '@/lib/phone';
import {
  approveQuote,
  cancelQuote,
  convertQuoteToPackage,
  createQuote,
  createQuoteFollowUp,
  createQuoteShareLink,
  duplicateQuote,
  getQuoteDetail,
  listQuotes,
  markQuoteSent,
  rejectQuote,
  respondQuoteByToken,
  revokeQuoteLinks,
  updateQuote,
} from '@/server/data/quotes';
import { prisma } from '@/lib/db';
import { assertQuoteDiscountAllowed } from '@/server/data/business-preferences';
import { appBaseUrl } from '@/server/app-url';

/*
  Orçamentos (plano Profissional em diante). Toda a equipe pode preparar, enviar e registrar a
  resposta do cliente; o servidor confere o plano em cada ação.
*/

async function session() {
  const s = await requireCurrentCompany();
  assertFeature(s.company, 'quotes');
  return s;
}

export async function listQuotesAction(input: unknown) {
  return toActionResult(async () => {
    const filter = z
      .object({ status: z.string().max(20).optional(), clientId: z.string().max(64).optional() })
      .parse(input ?? {});
    const { company } = await session();
    return listQuotes(company.id, filter);
  });
}

export async function getQuoteAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company } = await session();
    return getQuoteDetail(company.id, id, company.timezone);
  });
}

export async function createQuoteAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = quoteInputSchema.parse(input);
    const { company, userId } = await session();
    await assertQuoteDiscountAllowed(company.id, parsed);
    const quote = await createQuote({
      companyId: company.id,
      timezone: company.timezone,
      userId,
      input: parsed,
    });
    return { id: quote.id, number: quote.number };
  });
}

export async function updateQuoteAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ id: z.string().min(1).max(64), expectedVersion: z.number().int().min(1) })
      .and(quoteInputSchema)
      .parse(input);
    const { company, userId } = await session();
    await assertQuoteDiscountAllowed(company.id, parsed);
    return updateQuote({
      companyId: company.id,
      timezone: company.timezone,
      userId,
      id: parsed.id,
      expectedVersion: parsed.expectedVersion,
      input: parsed,
    });
  });
}

export async function duplicateQuoteAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company, userId } = await session();
    const quote = await duplicateQuote({
      companyId: company.id,
      timezone: company.timezone,
      userId,
      id,
    });
    return { id: quote.id, number: quote.number };
  });
}

/** Marca como enviado e gera o link protegido (com a mensagem pronta para o WhatsApp da equipe). */
export async function shareQuoteAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company, userId } = await session();
    await markQuoteSent(company.id, userId, id);
    const token = await createQuoteShareLink(company.id, userId, id);
    const quote = await prisma.quote.findFirstOrThrow({
      where: { id, companyId: company.id },
      include: { client: { select: { name: true, phone: true } } },
    });
    const url = `${await appBaseUrl()}/orcamento/${token}`;
    const first = quote.client.name.trim().split(/\s+/)[0];
    const message = `Olá, ${first}! Segue o orçamento "${quote.title}" da ${company.name}: ${url}\nVocê pode ver os detalhes e responder por ali.`;
    return { url, message, whatsappUrl: whatsappLink(quote.client.phone, message) };
  });
}

export async function revokeQuoteLinksAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company, userId } = await session();
    await revokeQuoteLinks(company.id, userId, id);
  });
}

export async function approveQuoteAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        id: z.string().min(1).max(64),
        version: z.number().int().min(1),
        contentHash: z.string().length(64),
        note: z.string().max(500).nullish(),
      })
      .parse(input);
    const { company, userId } = await session();
    await approveQuote({ companyId: company.id, userId, ...parsed });
  });
}

export async function rejectQuoteAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ id: z.string().min(1).max(64), reason: z.string().max(500).nullish() })
      .parse(input);
    const { company, userId } = await session();
    await rejectQuote({ companyId: company.id, userId, id: parsed.id, reason: parsed.reason });
  });
}

export async function cancelQuoteAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company, userId } = await session();
    await cancelQuote(company.id, userId, id);
  });
}

export async function convertQuoteToPackageAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company, userId } = await session();
    const pkg = await convertQuoteToPackage({
      companyId: company.id,
      timezone: company.timezone,
      userId,
      id,
    });
    return { packageId: pkg.id, clientId: pkg.clientId };
  });
}

export async function createQuoteFollowUpAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        id: z.string().min(1).max(64),
        dueAt: z.coerce.date().nullish(),
        title: z.string().max(160).nullish(),
      })
      .parse(input);
    const { company, userId } = await session();
    const { task } = await createQuoteFollowUp({
      companyId: company.id,
      userId,
      id: parsed.id,
      dueAt: parsed.dueAt ?? null,
      title: parsed.title,
    });
    return { id: task.id };
  });
}

// ---- Link público (sem login): o token é a credencial -------------------------------------------

const tokenInput = z.string().min(20).max(200);

export async function respondQuoteByTokenAction(input: unknown) {
  return toActionResult(async () => {
    await rateLimit('quote-respond', 10, 60_000);
    const parsed = z
      .discriminatedUnion('approve', [
        z.object({
          token: tokenInput,
          approve: z.literal(true),
          version: z.number().int().min(1),
          contentHash: z.string().length(64),
        }),
        z.object({
          token: tokenInput,
          approve: z.literal(false),
          reason: z.string().max(500).optional(),
        }),
      ])
      .parse(input);
    const { token, ...answer } = parsed;
    await respondQuoteByToken(token, answer);
  });
}
