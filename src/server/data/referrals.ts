import { prisma } from '@/lib/db';
import { UserError } from '@/server/errors';
import { recordAuditLog } from '@/server/data/audit';

/*
  Programa de indicações (Profissional+).
  - Uma indicação por cliente indicado; ninguém indica a si mesmo.
  - Condição configurada por indicação: primeiro atendimento concluído ou primeiro pagamento.
  - Só vira "qualificada" quando a condição é cumprida DEPOIS do registro; se o atendimento for
    cancelado ou o pagamento estornado antes da recompensa, volta a "pendente".
  - Recompensa é registrada (quem concedeu, quando, o quê). Nenhum crédito financeiro é criado
    aqui: se o benefício for desconto ou crédito, ele é lançado pelo caminho próprio (cupom,
    fidelidade, financeiro) e anotado.
*/

export const REFERRAL_CONDITIONS = {
  first_appointment_done: 'Primeiro atendimento concluído',
  first_payment: 'Primeiro pagamento recebido',
} as const;
export type ReferralCondition = keyof typeof REFERRAL_CONDITIONS;

export async function createReferral(
  companyId: string,
  userId: string,
  input: {
    referrerId: string;
    referredId: string;
    condition: ReferralCondition;
    rewardDescription?: string | null;
  },
) {
  if (input.referrerId === input.referredId) throw new UserError('Ninguém indica a si mesmo.');
  const clients = await prisma.client.findMany({
    where: { companyId, id: { in: [input.referrerId, input.referredId] } },
    select: { id: true, referredById: true },
  });
  if (clients.length !== 2) throw new UserError('Cliente não encontrado.');
  const existing = await prisma.referral.findUnique({ where: { referredId: input.referredId } });
  if (existing) throw new UserError('Este cliente já tem uma indicação registrada.');
  // Indicação cruzada (A indicou B e B indicou A) não vale.
  const reverse = await prisma.referral.findFirst({
    where: { companyId, referrerId: input.referredId, referredId: input.referrerId },
  });
  if (reverse)
    throw new UserError('Indicação cruzada não vale: este cliente foi indicado pelo outro.');
  const referral = await prisma.referral.create({
    data: {
      companyId,
      referrerId: input.referrerId,
      referredId: input.referredId,
      condition: input.condition,
      rewardDescription: input.rewardDescription?.trim().slice(0, 200) || null,
      createdByUserId: userId,
    },
  });
  // Mantém o campo antigo "indicado por" coerente (sem sobrescrever se já existia).
  const referred = clients.find((c) => c.id === input.referredId)!;
  if (!referred.referredById) {
    await prisma.client.update({
      where: { id: input.referredId },
      data: { referredById: input.referrerId },
    });
  }
  await recordAuditLog({
    companyId,
    entityType: 'Referral',
    entityId: referral.id,
    action: 'created',
    userId,
  });
  return referral;
}

/** Registro que cumpre a condição (o primeiro, depois da indicação), ou null. */
async function qualifyingRef(
  companyId: string,
  referral: { referredId: string; condition: string; createdAt: Date },
) {
  if (referral.condition === 'first_payment') {
    const paid = await prisma.transaction.findFirst({
      where: {
        companyId,
        clientId: referral.referredId,
        type: 'INCOME',
        status: 'PAID',
        paidAt: { gte: referral.createdAt },
      },
      orderBy: { paidAt: 'asc' },
      select: { id: true },
    });
    return paid?.id ?? null;
  }
  const done = await prisma.appointment.findFirst({
    where: {
      companyId,
      clientId: referral.referredId,
      status: 'DONE',
      startAt: { gte: referral.createdAt },
    },
    orderBy: { startAt: 'asc' },
    select: { id: true },
  });
  return done?.id ?? null;
}

/**
 * Reavalia as indicações em aberto: pendente → qualificada quando a condição foi cumprida;
 * qualificada → pendente se o que cumpriu foi desfeito antes da recompensa.
 */
export async function evaluateReferrals(companyId: string) {
  const open = await prisma.referral.findMany({
    where: { companyId, status: { in: ['PENDING', 'QUALIFIED'] } },
    take: 500,
  });
  let changed = 0;
  for (const r of open) {
    const ref = await qualifyingRef(companyId, r);
    if (r.status === 'PENDING' && ref) {
      await prisma.referral.updateMany({
        where: { id: r.id, status: 'PENDING' },
        data: { status: 'QUALIFIED', qualifiedAt: new Date(), qualifiedRefId: ref },
      });
      changed++;
    } else if (r.status === 'QUALIFIED' && !ref) {
      await prisma.referral.updateMany({
        where: { id: r.id, status: 'QUALIFIED' },
        data: { status: 'PENDING', qualifiedAt: null, qualifiedRefId: null },
      });
      await recordAuditLog({
        companyId,
        entityType: 'Referral',
        entityId: r.id,
        action: 'status_changed',
        userId: 'system',
        metadata: { to: 'PENDING', reason: 'condição desfeita' },
      });
      changed++;
    }
  }
  return changed;
}

/** Concede a recompensa: só depois de qualificada, uma vez, com registro de quem e o quê. */
export async function grantReward(companyId: string, userId: string, id: string, note: string) {
  const text = note.trim();
  if (!text)
    throw new UserError('Descreva o benefício concedido (ex.: 10% no próximo serviço, cupom X).');
  await evaluateReferrals(companyId);
  const result = await prisma.referral.updateMany({
    where: { id, companyId, status: 'QUALIFIED' },
    data: {
      status: 'REWARDED',
      rewardedAt: new Date(),
      rewardedByUserId: userId,
      rewardNote: text.slice(0, 300),
    },
  });
  if (!result.count)
    throw new UserError(
      'A recompensa só é liberada quando a condição foi cumprida (e uma vez só).',
    );
  await recordAuditLog({
    companyId,
    entityType: 'Referral',
    entityId: id,
    action: 'completed',
    userId,
    metadata: { reward: true },
  });
}

export async function cancelReferral(
  companyId: string,
  userId: string,
  id: string,
  reason: string,
) {
  const result = await prisma.referral.updateMany({
    where: { id, companyId, status: { in: ['PENDING', 'QUALIFIED'] } },
    data: {
      status: 'CANCELED',
      canceledAt: new Date(),
      cancelReason: reason.trim().slice(0, 300) || null,
    },
  });
  if (!result.count) throw new UserError('Esta indicação não pode mais ser cancelada.');
  await recordAuditLog({
    companyId,
    entityType: 'Referral',
    entityId: id,
    action: 'canceled',
    userId,
  });
}

export async function listReferrals(companyId: string) {
  await evaluateReferrals(companyId);
  const rows = await prisma.referral.findMany({
    where: { companyId },
    include: {
      referrer: { select: { id: true, name: true } },
      referred: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    referrer: r.referrer,
    referred: r.referred,
    condition: r.condition as ReferralCondition,
    status: r.status,
    rewardDescription: r.rewardDescription,
    rewardNote: r.rewardNote,
    createdAt: r.createdAt.toISOString(),
    qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
    rewardedAt: r.rewardedAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
  }));
}
