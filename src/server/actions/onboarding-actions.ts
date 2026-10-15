'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { completeOnboarding } from '@/server/data/onboarding';

const time = z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.');

export async function completeOnboardingAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        services: z
          .array(
            z.object({
              name: z.string().trim().min(1, 'Dê um nome a cada serviço.').max(120),
              durationMinutes: z.number().int().min(5, 'Duração mínima de 5 minutos.').max(600),
              price: z.number().min(0).max(99_999),
            }),
          )
          .min(1, 'Escolha ao menos um serviço.')
          .max(30),
        professionals: z
          .array(
            z.object({ name: z.string().trim().min(1, 'Informe o nome de cada pessoa.').max(120) }),
          )
          .min(1, 'Cadastre ao menos uma pessoa que atende.')
          .max(30),
        hours: z.object({
          weekdays: z
            .array(z.number().int().min(0).max(6))
            .min(1, 'Escolha os dias de funcionamento.')
            .max(7),
          startTime: time,
          endTime: time,
        }),
        onlineBooking: z.boolean(),
      })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    await completeOnboarding(company, parsed);
    revalidatePath('/dashboard');
    return { slug: company.slug };
  });
}
