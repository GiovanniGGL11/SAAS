import { prisma } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';
import {
  parseSignupConfig,
  validateSignup,
  type SignupConfig,
  type SignupInput,
} from '@/lib/self-signup';
import { UserError } from '@/server/errors';
import { findClientByPhone } from '@/server/data/client-match';

/** Empresa com o cadastro pelo link ligado (a página pública some quando está desligado). */
export async function getSignupCompany(slug: string) {
  const company = await prisma.company.findFirst({
    where: { slug, deletedAt: null, selfSignupEnabled: true },
    select: {
      id: true,
      name: true,
      slug: true,
      whatsapp: true,
      clerkOrgId: true,
      selfSignupFields: true,
    },
  });
  return company ? { ...company, config: parseSignupConfig(company.selfSignupFields) } : null;
}

export class SignupValidationError extends UserError {
  constructor(readonly fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? 'Confira os dados.');
    this.name = 'SignupValidationError';
  }
}

/**
 * Grava o cadastro feito pelo próprio cliente. Se já existe cliente com o mesmo WhatsApp, só
 * completa o que está em branco — nada que o negócio já tem é trocado — e a resposta é a mesma
 * (a página pública não revela quem já é cliente).
 */
export async function submitSelfSignup(
  companyId: string,
  config: SignupConfig,
  input: SignupInput & { marketingOptIn?: boolean },
) {
  const { values, errors } = validateSignup(input, config);
  if (Object.keys(errors).length) throw new SignupValidationError(errors);
  const phone = normalizePhone(values.phone);
  if (!phone) throw new SignupValidationError({ phone: 'Confira o WhatsApp.' });

  const data = { ...values, phone };
  const existing = await findClientByPhone(companyId, phone);
  if (existing) {
    const fill: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'name' || key === 'phone' || value === null) continue;
      if (existing[key as keyof typeof existing] === null) fill[key] = value;
    }
    if (Object.keys(fill).length) {
      await prisma.client.update({ where: { id: existing.id }, data: fill });
    }
    return { created: false, clientId: existing.id };
  }

  const client = await prisma.client.create({
    data: {
      companyId,
      ...data,
      // Promoções só com o "sim" do cliente; confirmação e lembrete continuam (são de serviço).
      ...(input.marketingOptIn
        ? {}
        : { marketingOptOutAt: new Date(), marketingOptOutBy: 'client' }),
    },
    select: { id: true },
  });
  return { created: true, clientId: client.id };
}
