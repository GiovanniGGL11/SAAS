'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { SIGNUP_FIELDS, parseSignupConfig } from '@/lib/self-signup';
import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { rateLimit } from '@/server/rate-limit';
import { UserError } from '@/server/errors';
import {
  SignupValidationError,
  getSignupCompany,
  submitSelfSignup,
} from '@/server/data/self-signup';

const text = (max: number) => z.string().max(max).optional();

/** Página pública /cadastro/[slug]: o cliente preenche a própria ficha. Sem login. */
export async function submitSelfSignupAction(input: unknown) {
  return toActionResult(async () => {
    await rateLimit('self-signup', 8, 10 * 60_000);
    const data = z
      .object({
        slug: z.string().min(1).max(120),
        name: z.string().max(200),
        phone: z.string().max(40),
        email: text(200),
        birthDate: text(20),
        cpf: text(20),
        zipCode: text(12),
        street: text(200),
        number: text(20),
        complement: text(80),
        district: text(80),
        city: text(120),
        state: text(2),
        notes: text(1000),
        marketingOptIn: z.boolean().optional(),
        // Armadilha para robôs: campo escondido que gente de verdade não preenche.
        website: z.string().max(200).optional(),
      })
      .parse(input);
    if (data.website) return { status: 'ok' as const };

    const company = await getSignupCompany(data.slug);
    if (!company) throw new UserError('O cadastro por link não está disponível agora.');
    try {
      await submitSelfSignup(company.id, company.config, data);
      return { status: 'ok' as const };
    } catch (error) {
      if (error instanceof SignupValidationError) {
        return { status: 'invalid' as const, fields: error.fields };
      }
      throw error;
    }
  });
}

/** Link do cliente → Cadastro: liga/desliga e escolhe o que pedir. */
export async function saveSelfSignupSettingsAction(input: unknown) {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    const mode = z.enum(['off', 'optional', 'required']);
    const data = z
      .object({
        enabled: z.boolean(),
        fields: z.object(
          Object.fromEntries(SIGNUP_FIELDS.map((f) => [f.key, mode])) as Record<
            (typeof SIGNUP_FIELDS)[number]['key'],
            typeof mode
          >,
        ),
      })
      .parse(input);
    await prisma.company.update({
      where: { id: company.id },
      data: { selfSignupEnabled: data.enabled, selfSignupFields: parseSignupConfig(data.fields) },
    });
    revalidatePath('/link-do-cliente');
    return { enabled: data.enabled };
  });
}
