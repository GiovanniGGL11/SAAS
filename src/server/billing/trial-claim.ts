import { createHash } from 'node:crypto';

import { prisma } from '@/lib/db';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import {
  isDisposableEmail,
  normalizeDocument,
  normalizeEmail,
  normalizeMobile,
} from '@/lib/trial-identity';
import { UserError } from '@/server/errors';

/*
  teste grátis: um por pessoa. Empresa nova nasce com o teste "a liberar" (trialPending) e só
  ganha os dias depois de conferir conta, e-mail, CPF/CNPJ, celular e rede (IP) contra quem já
  usou. Os dados ficam guardados só como hash (dá para comparar, não para ler de volta).
*/

/** Testes liberados a partir da mesma rede em 30 dias (operadoras e escritórios dividem IP). */
export const TRIAL_IP_LIMIT = 2;
const IP_WINDOW_MS = 30 * 86_400_000;

type ClaimKind = 'user' | 'email' | 'document' | 'phone' | 'ip';

const hashOf = (kind: ClaimKind, value: string) =>
  createHash('sha256').update(`atendafy-trial:${kind}:${value}`).digest('hex');

export type TrialClaimInput = {
  companyId: string;
  userId: string;
  /** E-mails verificados da conta. */
  emails: string[];
  document: string;
  phone: string;
  ip: string | null;
  now?: Date;
};

export type TrialClaimResult =
  | { granted: true; trialEndsAt: Date }
  /** `final`: a empresa fica sem teste (só assinando); senão, dá para corrigir o dado e tentar de novo. */
  | { granted: false; reason: string; final: boolean };

export async function claimTrial(input: TrialClaimInput): Promise<TrialClaimResult> {
  const now = input.now ?? new Date();
  const document = normalizeDocument(input.document);
  if (!document) throw new UserError('CPF ou CNPJ inválido. Confira os números.');
  const phone = normalizeMobile(input.phone);
  if (!phone)
    throw new UserError('Celular inválido. Informe com DDD, por exemplo (11) 91234-5678.');

  const emails = [...new Set(input.emails.map(normalizeEmail))];
  const keys: { kind: ClaimKind; valueHash: string }[] = [
    { kind: 'user', valueHash: hashOf('user', input.userId) },
    ...emails.map((e) => ({ kind: 'email' as const, valueHash: hashOf('email', e) })),
    { kind: 'document', valueHash: hashOf('document', document) },
    { kind: 'phone', valueHash: hashOf('phone', phone) },
  ];
  const ipHash = input.ip ? hashOf('ip', input.ip) : null;

  return prisma.$transaction(async (tx) => {
    // Um pedido de cada vez: dois pedidos simultâneos não liberam dois testes com os mesmos dados.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('atendafy-trial-claim'))`;

    const company = await tx.company.findUniqueOrThrow({
      where: { id: input.companyId },
      select: { trialPending: true },
    });
    if (!company.trialPending) throw new UserError('O mês grátis desta empresa já foi definido.');

    const deny = async (reason: string, final: boolean): Promise<TrialClaimResult> => {
      if (final) {
        await tx.company.update({
          where: { id: input.companyId },
          data: { trialPending: false, trialEndsAt: now },
        });
      }
      return { granted: false, reason, final };
    };

    if (emails.length === 0 || input.emails.every(isDisposableEmail)) {
      return deny(
        'E-mail temporário não libera o teste grátis. Assine um plano para continuar.',
        true,
      );
    }

    const used = new Set(
      (
        await tx.trialClaim.findMany({
          where: { OR: keys.map((k) => ({ kind: k.kind, valueHash: k.valueHash })) },
          select: { kind: true },
        })
      ).map((c) => c.kind),
    );
    if (used.has('user')) return deny('Sua conta já usou o teste grátis em outra empresa.', true);
    if (used.has('email')) return deny('Esse e-mail já usou o teste grátis.', true);
    if (used.has('document')) return deny('Esse CPF/CNPJ já usou o teste grátis.', false);
    if (used.has('phone')) return deny('Esse celular já usou o teste grátis.', false);

    if (ipHash) {
      const fromIp = await tx.trialClaim.count({
        where: {
          kind: 'ip',
          valueHash: ipHash,
          createdAt: { gt: new Date(now.getTime() - IP_WINDOW_MS) },
        },
      });
      if (fromIp >= TRIAL_IP_LIMIT) {
        return deny(
          'Muitos testes grátis liberados nesta rede. Assine um plano para continuar.',
          true,
        );
      }
    }

    await tx.trialClaim.createMany({
      data: [...keys, ...(ipHash ? [{ kind: 'ip' as const, valueHash: ipHash }] : [])].map((k) => ({
        ...k,
        companyId: input.companyId,
        createdAt: now,
      })),
    });
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
    await tx.company.update({
      where: { id: input.companyId },
      data: { trialPending: false, trialEndsAt },
    });
    return { granted: true, trialEndsAt };
  });
}
