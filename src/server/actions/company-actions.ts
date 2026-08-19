'use server';

import { revalidatePath } from 'next/cache';

import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { updateCompanyTimezone } from '@/server/data/company';
import { updateCompanyTimezoneInput } from '@/lib/validations/company';

export async function updateCompanyTimezoneAction(input: unknown) {
  const parsed = updateCompanyTimezoneInput.parse(input);
  const { company } = await requireCurrentCompany();

  await updateCompanyTimezone(company.id, parsed.timezone);
  revalidatePath('/configuracoes');
  revalidatePath('/agenda');
  revalidatePath('/dashboard');
}
