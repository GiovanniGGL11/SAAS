'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { toActionResult } from '@/server/action-result';
import { UserError } from '@/server/errors';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { openSecret, sealSecret } from '@/server/secret-box';
import { AsaasError, asaasBaseUrl, asaasRequest } from '@/server/billing/asaas';

export async function getDepositSettingsAction() {
  const { company } = await requireCompanyAdmin();
  const full = await prisma.company.findUniqueOrThrow({
    where: { id: company.id },
    select: {
      asaasApiKey: true,
      depositPercent: true,
      depositHoldMinutes: true,
      depositRequired: true,
    },
  });
  let environment: 'sandbox' | 'producao' | null = null;
  if (full.asaasApiKey) {
    try {
      environment = asaasBaseUrl(openSecret(full.asaasApiKey)).includes('sandbox')
        ? 'sandbox'
        : 'producao';
    } catch {
      environment = null;
    }
  }
  return {
    connected: Boolean(full.asaasApiKey),
    environment,
    percent: full.depositPercent,
    holdMinutes: full.depositHoldMinutes,
    required: full.depositRequired,
  };
}

export async function saveDepositSettingsAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        apiKey: z.string().trim().max(300).optional(),
        percent: z.number().int().min(0).max(100, 'Até 100%.'),
        holdMinutes: z.number().int().min(10, 'Mínimo de 10 minutos.').max(1440),
        required: z.boolean().optional(),
      })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    const current = await prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      select: { asaasApiKey: true },
    });
    if (parsed.apiKey) {
      // Confere a chave antes de guardar: uma chamada simples que só funciona com chave válida.
      try {
        await asaasRequest(parsed.apiKey, '/customers?limit=1');
      } catch (error) {
        if (error instanceof AsaasError)
          throw new UserError(`A Asaas não aceitou a chave: ${error.message}`);
        throw error;
      }
    }
    if (parsed.percent > 0 && !parsed.apiKey && !current.asaasApiKey) {
      throw new UserError('Cole a chave da sua conta Asaas para cobrar o sinal.');
    }
    await prisma.company.update({
      where: { id: company.id },
      data: {
        depositPercent: parsed.percent,
        depositHoldMinutes: parsed.holdMinutes,
        ...(parsed.required !== undefined ? { depositRequired: parsed.required } : {}),
        ...(parsed.apiKey ? { asaasApiKey: sealSecret(parsed.apiKey) } : {}),
      },
    });
    revalidatePath('/configuracoes');
  });
}

export async function removeDepositKeyAction() {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    await prisma.company.update({
      where: { id: company.id },
      data: { asaasApiKey: null, depositPercent: 0 },
    });
    revalidatePath('/configuracoes');
  });
}
