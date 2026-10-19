'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { toActionResult } from '@/server/action-result';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { assertFeature } from '@/server/billing/features';
import { rateLimitByKey } from '@/server/rate-limit';
import { IMPORT_LIMITS } from '@/lib/import';
import { analyzeColumns, listImportBatches, previewImport, runImport } from '@/server/data/imports';

/*
  Importação assistida (plano Profissional em diante, só administradores). O texto do arquivo é
  tratado como DADO; o mapeamento vem da pessoa, conferido no servidor.
*/

const kind = z.enum(['clients', 'products']);
const text = z
  .string()
  .min(1)
  .max(IMPORT_LIMITS.maxBytes * 2);
const mapping = z.record(z.string().max(30), z.number().int().min(0).max(200).nullable());

async function session() {
  const s = await requireCompanyAdmin();
  assertFeature(s.company, 'assistedImport');
  rateLimitByKey(`import:${s.userId}`, 30, 60_000);
  return s;
}

export async function analyzeImportAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ kind, text }).parse(input);
    await session();
    return analyzeColumns(parsed.kind, parsed.text);
  });
}

export async function previewImportAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ kind, text, mapping }).parse(input);
    const { company } = await session();
    return previewImport({ companyId: company.id, ...parsed });
  });
}

export async function runImportAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        kind,
        text,
        mapping,
        fileName: z.string().max(200).nullish(),
        duplicateMode: z.enum(['skip', 'fill_empty']),
      })
      .parse(input);
    const { company, userId } = await session();
    const result = await runImport({ companyId: company.id, userId, ...parsed });
    revalidatePath(parsed.kind === 'clients' ? '/clientes' : '/estoque');
    return result;
  });
}

export async function listImportBatchesAction() {
  return toActionResult(async () => {
    const { company } = await session();
    return listImportBatches(company.id);
  });
}
