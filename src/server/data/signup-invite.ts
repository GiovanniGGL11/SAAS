import { createHmac, timingSafeEqual } from 'node:crypto';

import { prisma } from '@/lib/db';
import { parseSignupConfig, type SignupInput } from '@/lib/self-signup';
import { UserError } from '@/server/errors';
import { submitSelfSignup } from '@/server/data/self-signup';
import { createEntryLink, requestEntry } from '@/server/data/forms';
import { resolveFormAccess } from '@/server/data/form-permissions';

/*
  Convite "cadastro + ficha": para um número que ainda não é cliente, a equipe manda um link só.
  A pessoa faz o próprio cadastro (vira cliente na hora) e cai direto na ficha (ex.: anamnese),
  que preenche e assina pelo celular.

  O link é assinado (HMAC, o mesmo segredo dos links da área do cliente) e diz a empresa, o
  modelo de ficha e até quando vale. Vale mesmo com o "cadastro pelo link" desligado: o convite é
  a autorização. Quem já é cliente com o mesmo WhatsApp não vira duplicado: o cadastro só completa
  o que estiver em branco (a regra do cadastro pelo link).
*/

export const SIGNUP_INVITE_DAYS = 7;
/** Quem aparece no histórico da ficha pedida pelo convite. */
export const SIGNUP_INVITE_ACTOR = 'client-signup-link';

function secret(): string {
  const value = process.env.BOOKING_LINK_SECRET || process.env.CLERK_SECRET_KEY;
  if (!value) throw new Error('BOOKING_LINK_SECRET não configurado.');
  return value;
}

function signature(companyId: string, templateId: string, exp: number): string {
  return createHmac('sha256', secret())
    .update(`signup-invite:${companyId}:${templateId}:${exp}`)
    .digest('base64url')
    .slice(0, 32);
}

export function signSignupInvite(companyId: string, templateId: string, now = new Date()) {
  const exp = Math.floor(now.getTime() / 1000) + SIGNUP_INVITE_DAYS * 86_400;
  return {
    token: `${companyId}.${templateId}.${exp}.${signature(companyId, templateId, exp)}`,
    expiresAt: new Date(exp * 1000),
  };
}

/** Confere assinatura e validade. `null` = link adulterado, de outra empresa ou vencido. */
export function readSignupInvite(
  token: string | null | undefined,
  now = new Date(),
): { companyId: string; templateId: string; expiresAt: Date } | null {
  if (!token) return null;
  const [companyId, templateId, rawExp, sig, ...rest] = token.split('.');
  if (!companyId || !templateId || !rawExp || !sig || rest.length) return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(companyId) || !/^[A-Za-z0-9_-]{1,64}$/.test(templateId)) {
    return null;
  }
  if (!/^\d{9,11}$/.test(rawExp)) return null;
  const exp = Number(rawExp);
  const given = Buffer.from(sig);
  const expected = Buffer.from(signature(companyId, templateId, exp));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (exp * 1000 <= now.getTime()) return null;
  return { companyId, templateId, expiresAt: new Date(exp * 1000) };
}

/** O que a página pública precisa para mostrar o convite (empresa ativa e ficha ainda ativa). */
export async function getSignupInvite(slug: string, token: string | null | undefined) {
  const invite = readSignupInvite(token);
  if (!invite) return null;
  const [company, template] = await Promise.all([
    prisma.company.findFirst({
      where: { id: invite.companyId, slug, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        whatsapp: true,
        clerkOrgId: true,
        selfSignupFields: true,
      },
    }),
    prisma.formTemplate.findFirst({
      where: { id: invite.templateId, companyId: invite.companyId, status: 'ACTIVE' },
      select: { id: true, name: true },
    }),
  ]);
  if (!company || !template) return null;
  return {
    company: { ...company, config: parseSignupConfig(company.selfSignupFields) },
    template,
    expiresAt: invite.expiresAt,
  };
}

/**
 * Cadastro pelo convite: grava (ou completa) o cliente, pede a ficha do convite e gera o link dela.
 * Devolve o token da ficha, para a página levar a pessoa direto para lá.
 */
export async function completeSignupInvite(
  slug: string,
  token: string,
  input: SignupInput & { marketingOptIn?: boolean },
) {
  const invite = await getSignupInvite(slug, token);
  if (!invite) {
    throw new UserError(
      'Este convite venceu ou não vale mais. Peça um novo link ao estabelecimento.',
    );
  }
  const { company, template } = invite;
  const { clientId } = await submitSelfSignup(company.id, company.config, input);
  const access = resolveFormAccess({
    userId: SIGNUP_INVITE_ACTOR,
    isAdmin: true,
    grant: null,
    professionalId: null,
  });
  const { entry } = await requestEntry({
    companyId: company.id,
    userId: SIGNUP_INVITE_ACTOR,
    clientId,
    templateId: template.id,
    source: 'manual',
  });
  if (entry.status === 'SUBMITTED' || entry.status === 'REVIEWED') {
    // Já respondida (em aberto não havia): nada a preencher agora.
    return { formToken: null };
  }
  const link = await createEntryLink(company.id, access, entry.id);
  return { formToken: link.token };
}
