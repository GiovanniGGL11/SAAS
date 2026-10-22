'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { anonymizeClient, exportClientData } from '@/server/data/client-privacy';

const clientId = z.string().min(1).max(64);

/** LGPD: exportar os dados do cliente (só administradores; fica na auditoria). */
export async function exportClientDataAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ clientId }).parse(input);
    const { company, userId } = await requireCompanyAdmin();
    return exportClientData(company.id, parsed.clientId, userId);
  });
}

/** LGPD: anonimizar a pedido do titular (só administradores; não tem volta). */
export async function anonymizeClientAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        clientId,
        deleteForms: z.boolean(),
        // Confirmação digitada na tela, conferida também aqui.
        confirmation: z.literal('ANONIMIZAR', { message: 'Digite ANONIMIZAR para confirmar.' }),
      })
      .parse(input);
    const { company, userId } = await requireCompanyAdmin();
    const result = await anonymizeClient(company.id, userId, parsed.clientId, {
      deleteForms: parsed.deleteForms,
    });
    revalidatePath('/clientes');
    revalidatePath(`/clientes/${parsed.clientId}`);
    return result;
  });
}
