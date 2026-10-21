'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { toActionResult } from '@/server/action-result';
import { rateLimit } from '@/server/rate-limit';
import { UserError, parseId } from '@/server/errors';
import { appBaseUrl } from '@/server/app-url';
import { whatsappLink } from '@/lib/phone';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  SEGMENTS,
  createCampaign,
  getCampaign,
  getReviewSummary,
  createReviewFollowUp,
  listCampaigns,
  listTopReferrers,
  markCampaignSent,
  segmentClients,
  signReviewToken,
  submitReview,
  type Segment,
} from '@/server/data/relationship';

const segment = z.enum(Object.keys(SEGMENTS) as [Segment, ...Segment[]]);

// ---- Avaliações ------------------------------------------------------------------------------

/** Público: o cliente avalia pelo link. Limite por IP contra robôs. */
export async function submitReviewAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        token: z.string().min(10).max(200),
        rating: z.number().int().min(1, 'Escolha de 1 a 5 estrelas.').max(5),
        comment: z.string().max(1000).optional(),
        publicConsent: z.boolean().optional(),
      })
      .parse(input);
    await rateLimit('review', 10, 10 * 60_000);
    await submitReview(parsed.token, parsed.rating, parsed.comment, parsed.publicConsent ?? false);
  });
}

/** Mensagem pronta para pedir a avaliação de um atendimento concluído. */
export async function getReviewLinkAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company } = await requireCurrentCompany();
    const appointment = await prisma.appointment.findFirst({
      where: { id, companyId: company.id, status: 'DONE' },
      include: { client: { select: { name: true, phone: true } } },
    });
    if (!appointment) throw new UserError('Só dá para pedir avaliação de atendimento concluído.');
    const url = `${await appBaseUrl()}/avaliar/${signReviewToken(appointment.id)}`;
    const message = `Oi, ${appointment.client.name.split(' ')[0]}! Obrigado pela visita na ${company.name}. Como foi o seu ${appointment.serviceNameSnapshot}? Leva 10 segundos: ${url}`;
    return { url, whatsappUrl: whatsappLink(appointment.client.phone, message) };
  });
}

/** Cria a tarefa de tratamento de uma avaliação (uma por avaliação). */
export async function createReviewFollowUpAction(rawId: unknown) {
  return toActionResult(async () => {
    const id = parseId(rawId);
    const { company, userId } = await requireCompanyAdmin();
    const task = await createReviewFollowUp(company.id, userId, id);
    return { taskId: task.id };
  });
}

export async function getReviewSummaryAction() {
  const { company } = await requireCompanyAdmin();
  return getReviewSummary(company.id);
}

export async function setGoogleReviewUrlAction(input: unknown) {
  return toActionResult(async () => {
    const { url } = z
      .object({
        url: z
          .string()
          .trim()
          .max(500)
          .refine(
            (v) => v === '' || /^https:\/\//.test(v),
            'Cole o link completo (começando com https://).',
          ),
      })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    await prisma.company.update({
      where: { id: company.id },
      data: { googleReviewUrl: url || null },
    });
    revalidatePath('/configuracoes');
  });
}

// ---- Campanhas ---------------------------------------------------------------------------------

export async function previewSegmentAction(input: unknown) {
  const parsed = z.object({ segment }).parse(input);
  const { company } = await requireCompanyAdmin();
  const clients = await segmentClients(company.id, parsed.segment, company.timezone);
  const withPhone = clients.filter((c) => (c.phone ?? '').replace(/\D/g, '').length >= 10);
  return {
    total: clients.length,
    withPhone: withPhone.length,
    sample: withPhone.slice(0, 5).map((c) => c.name),
  };
}

export async function createCampaignAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        name: z.string().trim().min(1, 'Dê um nome à campanha.').max(120),
        segment,
        message: z.string().trim().min(5, 'Escreva a mensagem.').max(1000),
        couponCode: z.string().trim().max(40).optional(),
      })
      .parse(input);
    const { userId, company } = await requireCompanyAdmin();
    const campaign = await createCampaign({
      companyId: company.id,
      timezone: company.timezone,
      ...parsed,
      userId,
    });
    return { id: campaign.id };
  });
}

export async function listCampaignsAction() {
  const { company } = await requireCompanyAdmin();
  return listCampaigns(company.id);
}

export async function getCampaignAction(rawId: unknown) {
  const id = parseId(rawId);
  const { company } = await requireCompanyAdmin();
  const campaign = await getCampaign(company.id, id);
  return {
    ...campaign,
    recipients: campaign.recipients.map((r) => ({
      ...r,
      whatsappUrl: whatsappLink(r.phone, r.text),
    })),
  };
}

export async function markCampaignSentAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ campaignId: z.string().min(1).max(64), clientId: z.string().min(1).max(64) })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    await markCampaignSent(company.id, parsed.campaignId, parsed.clientId);
  });
}

// ---- Indicações --------------------------------------------------------------------------------

export async function listTopReferrersAction() {
  const { company } = await requireCompanyAdmin();
  return listTopReferrers(company.id);
}

export async function getClientReferralsAction(rawId: unknown) {
  const id = parseId(rawId);
  const { company } = await requireCurrentCompany();
  const client = await prisma.client.findFirst({
    where: { id, companyId: company.id },
    select: {
      referredBy: { select: { id: true, name: true } },
      referrals: { select: { id: true, name: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  return { referredBy: client?.referredBy ?? null, referrals: client?.referrals ?? [] };
}
