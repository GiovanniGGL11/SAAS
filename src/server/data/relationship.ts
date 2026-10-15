import { createHmac, timingSafeEqual } from 'node:crypto';

import { prisma } from '@/lib/db';
import { UserError } from '@/server/errors';
import { listLapsedClients } from '@/server/data/clients';
import { getTodayInTz } from '@/lib/time';

/*
  Relacionamento: avaliação depois do atendimento, mensagens para segmentos de clientes e
  programa de indicação.
*/

// ---- Avaliações ------------------------------------------------------------------------------

function secret(): string {
  const value = process.env.BOOKING_LINK_SECRET || process.env.CLERK_SECRET_KEY;
  if (!value) throw new Error('BOOKING_LINK_SECRET não configurado.');
  return value;
}

/** Link de avaliação assinado (sem tabela de tokens), separado do link de confirmação. */
export function signReviewToken(appointmentId: string): string {
  const sig = createHmac('sha256', secret())
    .update(`review:${appointmentId}`)
    .digest('base64url')
    .slice(0, 22);
  return `${appointmentId}.${sig}`;
}

export function verifyReviewToken(token: string): string | null {
  const [id, sig] = token.split('.');
  if (!id || !sig) return null;
  const expected = signReviewToken(id).split('.')[1];
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export async function getReviewContext(token: string) {
  const id = verifyReviewToken(token);
  if (!id) return null;
  const appointment = await prisma.appointment.findFirst({
    where: { id, status: 'DONE' },
    include: {
      client: { select: { name: true } },
      professional: { select: { name: true } },
      company: { select: { name: true, googleReviewUrl: true } },
      review: { select: { rating: true, comment: true } },
    },
  });
  if (!appointment) return null;
  return {
    companyName: appointment.company.name,
    googleReviewUrl: appointment.company.googleReviewUrl,
    clientFirstName: appointment.client.name.split(' ')[0],
    professionalName: appointment.professional.name,
    serviceName: appointment.serviceNameSnapshot,
    startAt: appointment.startAt,
    review: appointment.review,
  };
}

export async function submitReview(token: string, rating: number, comment?: string | null) {
  const id = verifyReviewToken(token);
  if (!id) throw new UserError('Link inválido.');
  const appointment = await prisma.appointment.findFirst({
    where: { id, status: 'DONE' },
    select: { id: true, companyId: true, clientId: true, professionalId: true },
  });
  if (!appointment) throw new UserError('Atendimento não encontrado.');
  const existing = await prisma.review.findUnique({ where: { appointmentId: id } });
  if (existing) throw new UserError('Você já avaliou este atendimento. Obrigado!');
  await prisma.review.create({
    data: {
      companyId: appointment.companyId,
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      professionalId: appointment.professionalId,
      rating,
      comment: comment?.trim() || null,
    },
  });
}

export async function getReviewSummary(companyId: string, range?: { startAt: Date; endAt: Date }) {
  const where = {
    companyId,
    ...(range ? { createdAt: { gte: range.startAt, lt: range.endAt } } : {}),
  };
  const [agg, byRating, byProfessional, latest] = await Promise.all([
    prisma.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
    prisma.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
    prisma.review.groupBy({
      by: ['professionalId'],
      where,
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        client: { select: { id: true, name: true } },
        professional: { select: { name: true } },
        appointment: { select: { serviceNameSnapshot: true } },
      },
    }),
  ]);
  return {
    average: agg._avg.rating === null ? null : Math.round(agg._avg.rating * 10) / 10,
    count: agg._count._all,
    distribution: [5, 4, 3, 2, 1].map((r) => ({
      rating: r,
      count: byRating.find((b) => b.rating === r)?._count._all ?? 0,
    })),
    byProfessional: Object.fromEntries(
      byProfessional.map((p) => [
        p.professionalId,
        { average: Math.round((p._avg.rating ?? 0) * 10) / 10, count: p._count._all },
      ]),
    ) as Record<string, { average: number; count: number }>,
    latest: latest.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      clientId: r.client.id,
      clientName: r.client.name,
      professionalName: r.professional.name,
      serviceName: r.appointment.serviceNameSnapshot,
    })),
  };
}

// ---- Campanhas por segmento -------------------------------------------------------------------

export const SEGMENTS = {
  lapsed: 'Sumidos há mais de 60 dias',
  birthdays: 'Aniversariantes do mês',
  vip: 'Clientes VIP',
  new: 'Novos (últimos 30 dias)',
  all: 'Todos os clientes ativos',
} as const;
export type Segment = keyof typeof SEGMENTS;

export async function segmentClients(companyId: string, segment: Segment, timezone: string) {
  const base = { companyId, active: true };
  const select = { id: true, name: true, phone: true } as const;
  switch (segment) {
    case 'lapsed': {
      const lapsed = await listLapsedClients(companyId, 60, 5000);
      return lapsed.map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
    }
    case 'birthdays': {
      const month = getTodayInTz(timezone).month;
      return prisma.$queryRaw<{ id: string; name: string; phone: string | null }[]>`
        SELECT id, name, phone FROM "Client"
        WHERE "companyId" = ${companyId} AND active = true AND "birthDate" IS NOT NULL
          AND EXTRACT(MONTH FROM "birthDate") = ${month}
        ORDER BY name`;
    }
    case 'vip':
      return prisma.client.findMany({
        where: { ...base, isVip: true },
        select,
        orderBy: { name: 'asc' },
      });
    case 'new':
      return prisma.client.findMany({
        where: { ...base, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        select,
        orderBy: { name: 'asc' },
      });
    case 'all':
      return prisma.client.findMany({ where: base, select, orderBy: { name: 'asc' } });
  }
}

/** Cria a campanha com a lista de quem tem WhatsApp no segmento, congelada neste momento. */
export async function createCampaign(params: {
  companyId: string;
  timezone: string;
  name: string;
  segment: Segment;
  message: string;
  couponCode?: string | null;
  userId: string;
}) {
  const clients = (await segmentClients(params.companyId, params.segment, params.timezone)).filter(
    (c) => (c.phone ?? '').replace(/\D/g, '').length >= 10,
  );
  if (clients.length === 0) throw new UserError('Nenhum cliente com WhatsApp neste segmento.');
  return prisma.campaign.create({
    data: {
      companyId: params.companyId,
      name: params.name.trim(),
      segment: params.segment,
      message: params.message.trim(),
      couponCode: params.couponCode?.trim().toUpperCase() || null,
      createdByUserId: params.userId,
      recipients: { create: clients.map((c) => ({ clientId: c.id })) },
    },
  });
}

/** Resultado: quantos receberam e quantos marcaram horário depois da mensagem. */
export async function listCampaigns(companyId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { recipients: { select: { clientId: true, sentAt: true } } },
  });
  return Promise.all(
    campaigns.map(async (c) => {
      const sent = c.recipients.filter((r) => r.sentAt);
      const returned = sent.length
        ? await prisma.appointment.findMany({
            where: {
              companyId,
              clientId: { in: sent.map((r) => r.clientId) },
              createdAt: { gte: c.createdAt },
              status: { not: 'CANCELED' },
            },
            select: { clientId: true },
            distinct: ['clientId'],
          })
        : [];
      return {
        id: c.id,
        name: c.name,
        segment: c.segment as Segment,
        createdAt: c.createdAt,
        recipients: c.recipients.length,
        sent: sent.length,
        returned: returned.length,
      };
    }),
  );
}

export function personalize(message: string, name: string, couponCode?: string | null) {
  return message.replaceAll('{nome}', name.split(' ')[0]).replaceAll('{cupom}', couponCode ?? '');
}

export async function getCampaign(companyId: string, id: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id, companyId },
    include: {
      recipients: {
        include: { client: { select: { id: true, name: true, phone: true } } },
        orderBy: { client: { name: 'asc' } },
      },
    },
  });
  if (!campaign) throw new UserError('Campanha não encontrada.');
  return {
    id: campaign.id,
    name: campaign.name,
    segment: campaign.segment as Segment,
    message: campaign.message,
    couponCode: campaign.couponCode,
    recipients: campaign.recipients.map((r) => ({
      clientId: r.client.id,
      name: r.client.name,
      phone: r.client.phone,
      sentAt: r.sentAt,
      text: personalize(campaign.message, r.client.name, campaign.couponCode),
    })),
  };
}

export async function markCampaignSent(companyId: string, campaignId: string, clientId: string) {
  const result = await prisma.campaignRecipient.updateMany({
    where: { campaignId, clientId, campaign: { companyId } },
    data: { sentAt: new Date() },
  });
  if (result.count === 0) throw new UserError('Destinatário não encontrado.');
}

// ---- Indicações -------------------------------------------------------------------------------

/** Quem mais trouxe clientes, com quanto os indicados já gastaram. */
export async function listTopReferrers(companyId: string) {
  const referred = await prisma.client.findMany({
    where: { companyId, referredById: { not: null } },
    select: { id: true, referredById: true },
  });
  if (referred.length === 0) return [];
  const spent = await prisma.appointment.groupBy({
    by: ['clientId'],
    where: { companyId, status: 'DONE', clientId: { in: referred.map((r) => r.id) } },
    _sum: { priceSnapshot: true },
  });
  const spentBy = new Map(spent.map((s) => [s.clientId, Number(s._sum.priceSnapshot ?? 0)]));
  const totals = new Map<string, { count: number; revenue: number }>();
  for (const r of referred) {
    const row = totals.get(r.referredById!) ?? { count: 0, revenue: 0 };
    row.count += 1;
    row.revenue += spentBy.get(r.id) ?? 0;
    totals.set(r.referredById!, row);
  }
  const referrers = await prisma.client.findMany({
    where: { companyId, id: { in: [...totals.keys()] } },
    select: { id: true, name: true, phone: true },
  });
  return referrers
    .map((c) => ({ ...c, ...totals.get(c.id)! }))
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue);
}
