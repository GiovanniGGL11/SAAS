'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { toActionResult } from '@/server/action-result';
import { requireCurrentCompany } from '@/server/auth/require-current-company';
import {
  addCashMovement,
  closeCashSession,
  getCashRegister,
  openCashSession,
} from '@/server/data/cash-register';

/*
  O caixa é da recepção: qualquer pessoa da equipe abre, lança sangria/suprimento e fecha. O
  financeiro completo continua só para admin.
*/

const money = z.number().min(0, 'O valor não pode ser negativo.').max(9_999_999);

export async function getCashRegisterAction() {
  const { company } = await requireCurrentCompany();
  return getCashRegister(company.id);
}

export async function openCashSessionAction(input: unknown) {
  return toActionResult(async () => {
    const { openingAmount } = z.object({ openingAmount: money }).parse(input);
    const { userId, company } = await requireCurrentCompany();
    await openCashSession(company.id, userId, openingAmount);
    revalidatePath('/caixa');
  });
}

export async function addCashMovementAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        sessionId: z.string().min(1).max(64),
        kind: z.enum(['WITHDRAWAL', 'DEPOSIT']),
        amount: z.number().positive('Informe o valor.').max(9_999_999),
        reason: z.string().max(200).optional(),
      })
      .parse(input);
    const { userId, company } = await requireCurrentCompany();
    await addCashMovement({ companyId: company.id, ...parsed, userId });
  });
}

export async function closeCashSessionAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        sessionId: z.string().min(1).max(64),
        countedCash: money,
        notes: z.string().max(500).optional(),
      })
      .parse(input);
    const { userId, company } = await requireCurrentCompany();
    const summary = await closeCashSession({ companyId: company.id, ...parsed, userId });
    revalidatePath('/caixa');
    return { expectedCash: summary.expectedCash, countedCash: summary.countedCash };
  });
}
