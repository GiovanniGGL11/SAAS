'use server';

import { toActionResult } from '@/server/action-result';

import { revalidatePath } from 'next/cache';

import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { updateCompanyTimezone } from '@/server/data/company';
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
