'use server';

import { z } from 'zod';

import { toActionResult } from '@/server/action-result';

import { revalidatePath } from 'next/cache';

import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { updateCompanyTimezone, updateCompanyWhatsapp } from '@/server/data/company';
import { updateCompanyTimezoneInput } from '@/lib/validations/company';

export async function updateCompanyTimezoneAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = updateCompanyTimezoneInput.parse(input);
    const { company } = await requireCompanyAdmin();

    await updateCompanyTimezone(company.id, parsed.timezone);
    revalidatePath('/configuracoes');
    revalidatePath('/agenda');
    revalidatePath('/dashboard');
  });
}

export async function updateCompanyWhatsappAction(input: unknown) {
  return toActionResult(async () => {
    const { whatsapp } = z.object({ whatsapp: z.string().trim().max(30).nullable() }).parse(input);
    const { company } = await requireCompanyAdmin();

    const saved = await updateCompanyWhatsapp(company.id, whatsapp || null);
    revalidatePath('/configuracoes');
    return { whatsapp: saved };
  });
}
