'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { parseId } from '@/server/errors';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { deleteScheduleBlock } from '@/server/data/appointments';
import {
  createAbsence,
  createWeeklyBlock,
  deleteBlockSeries,
  listUpcomingBlocks,
} from '@/server/data/absences';
import { createPurchase, listPurchases } from '@/server/data/purchases';

const id = z.string().min(1).max(64);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
  .transform((v) => {
    const [year, month, day] = v.split('-').map(Number);
    return { year, month, day };
  });
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido.');

export async function listUpcomingBlocksAction(rawProfessionalId: unknown) {
  const professionalId = parseId(rawProfessionalId);
  const { company } = await requireCompanyAdmin();
  return listUpcomingBlocks(company.id, professionalId, company.timezone);
}

export async function createAbsenceAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({ professionalId: id, from: date, to: date, reason: z.string().max(120).optional() })
      .parse(input);
    const { userId, company } = await requireCompanyAdmin();
    await createAbsence({ companyId: company.id, ...parsed, timezone: company.timezone, userId });
    revalidatePath('/agenda');
  });
}

export async function createWeeklyBlockAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        professionalId: id,
        weekday: z.number().int().min(0).max(6),
        startTime: time,
        endTime: time,
        weeks: z.number().int().min(1, 'Ao menos 1 semana.').max(26, 'Até 26 semanas por vez.'),
        reason: z.string().max(120).optional(),
      })
      .parse(input);
    const { userId, company } = await requireCompanyAdmin();
    const result = await createWeeklyBlock({
      companyId: company.id,
      ...parsed,
      timezone: company.timezone,
      userId,
    });
    revalidatePath('/agenda');
    return result;
  });
}

export async function deleteBlockAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ id, seriesId: id.nullable() }).parse(input);
    const { userId, company } = await requireCompanyAdmin();
    if (parsed.seriesId) await deleteBlockSeries(company.id, parsed.seriesId, userId);
    else await deleteScheduleBlock({ companyId: company.id, id: parsed.id, userId });
    revalidatePath('/agenda');
  });
}

export async function createPurchaseAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        supplier: z.string().max(120).optional(),
        invoiceNumber: z.string().max(40).optional(),
        items: z
          .array(
            z.object({
              productId: id,
              quantity: z.number().int().min(1, 'Quantidade mínima 1.').max(99_999),
              unitCost: z.number().min(0, 'Custo não pode ser negativo.').max(99_999),
            }),
          )
          .min(1, 'Adicione ao menos um produto.')
          .max(50),
        payment: z.union([
          z.object({
            method: z.enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'OTHER']),
          }),
          z.object({ dueDate: z.coerce.date() }),
        ]),
      })
      .parse(input);
    const { userId, company } = await requireCompanyAdmin();
    const result = await createPurchase({ companyId: company.id, ...parsed, userId });
    revalidatePath('/estoque');
    return result;
  });
}

export async function listPurchasesAction() {
  const { company } = await requireCompanyAdmin();
  return listPurchases(company.id);
}
