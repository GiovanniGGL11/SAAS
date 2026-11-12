'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { normalizePixKey, type PixKeyType } from '@/lib/pix';
import { toActionResult } from '@/server/action-result';
import { UserError } from '@/server/errors';
import { requireCompanyAdmin, requireCurrentCompany } from '@/server/auth/require-current-company';
import { openSecret, sealSecret } from '@/server/secret-box';
import { AsaasError, asaasBaseUrl, asaasRequest } from '@/server/billing/asaas';
import {
  canCreateSubaccount,
  companyAccountStatus,
  createCompanySubaccount,
} from '@/server/billing/subaccount';
import { markDepositPaid } from '@/server/billing/deposit';

export async function getDepositSettingsAction() {
  const { company } = await requireCompanyAdmin();
  const full = await prisma.company.findUniqueOrThrow({
    where: { id: company.id },
    select: {
      asaasApiKey: true,
      asaasAccountId: true,
      depositPercent: true,
      depositHoldMinutes: true,
      depositRequired: true,
      depositMethod: true,
      pixKey: true,
      pixKeyType: true,
      pixName: true,
      pixCity: true,
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
    /** Conta criada pelo Atendafy (subconta): a chave é nossa e não pode ser trocada nem removida. */
    managed: Boolean(full.asaasAccountId && full.asaasApiKey),
    canCreateAccount: canCreateSubaccount(),
    /** Aprovação da conta criada pelo Atendafy (APPROVED, PENDING, AWAITING_APPROVAL, REJECTED). */
    accountStatus: full.asaasAccountId ? await companyAccountStatus(full.asaasApiKey) : null,
    percent: full.depositPercent,
    holdMinutes: full.depositHoldMinutes,
    required: full.depositRequired,
    method: full.depositMethod === 'pix' ? ('pix' as const) : ('asaas' as const),
    pix: {
      key: full.pixKey ?? '',
      keyType: (full.pixKeyType as PixKeyType | null) ?? 'CPF',
      name: full.pixName ?? '',
      city: full.pixCity ?? '',
    },
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
        method: z.enum(['asaas', 'pix']).optional(),
        pix: z
          .object({
            key: z.string().trim().max(100),
            keyType: z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP']),
            name: z.string().trim().min(2, 'Informe o nome de quem recebe.').max(60),
            city: z.string().trim().min(2, 'Informe a cidade.').max(60),
          })
          .optional(),
      })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    if (parsed.method === 'pix') {
      if (!parsed.pix) throw new UserError('Informe a chave PIX.');
      const key = normalizePixKey(parsed.pix.keyType, parsed.pix.key);
      if (!key) throw new UserError('Chave PIX inválida para o tipo escolhido.');
      await prisma.company.update({
        where: { id: company.id },
        data: {
          depositMethod: 'pix',
          depositPercent: parsed.percent,
          depositHoldMinutes: parsed.holdMinutes,
          ...(parsed.required !== undefined ? { depositRequired: parsed.required } : {}),
          pixKey: key,
          pixKeyType: parsed.pix.keyType,
          pixName: parsed.pix.name,
          pixCity: parsed.pix.city,
        },
      });
      revalidatePath('/configuracoes');
      revalidatePath('/link-do-cliente');
      return;
    }
    const current = await prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      select: { asaasApiKey: true, asaasAccountId: true },
    });
    if (parsed.apiKey && current.asaasAccountId) {
      throw new UserError('A conta Asaas criada pelo Atendafy não pode ter a chave trocada.');
    }
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
        ...(parsed.method === 'asaas' ? { depositMethod: 'asaas' } : {}),
        depositPercent: parsed.percent,
        depositHoldMinutes: parsed.holdMinutes,
        ...(parsed.required !== undefined ? { depositRequired: parsed.required } : {}),
        ...(parsed.apiKey ? { asaasApiKey: sealSecret(parsed.apiKey) } : {}),
      },
    });
    revalidatePath('/configuracoes');
    revalidatePath('/link-do-cliente');
  });
}

export async function removeDepositKeyAction() {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    const current = await prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      select: { asaasAccountId: true },
    });
    // A chave de uma conta criada pelo Atendafy não volta a aparecer: apagar perderia o acesso.
    if (current.asaasAccountId) {
      throw new UserError(
        'A conta Asaas criada pelo Atendafy não pode ser desconectada. Para parar de cobrar pelo link, escolha "Receber na hora".',
      );
    }
    await prisma.company.update({
      where: { id: company.id },
      data: { asaasApiKey: null, depositPercent: 0 },
    });
    revalidatePath('/configuracoes');
    revalidatePath('/link-do-cliente');
  });
}

const onlyDigits = (v: string) => v.replace(/\D/g, '');

export async function createAsaasAccountAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        name: z.string().trim().min(2, 'Informe o nome ou a razão social.').max(120),
        email: z.email('E-mail inválido.'),
        cpfCnpj: z
          .string()
          .transform(onlyDigits)
          .refine((v) => v.length === 11 || v.length === 14, 'Informe um CPF ou CNPJ válido.'),
        birthDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        companyType: z.enum(['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION']).optional(),
        mobilePhone: z
          .string()
          .transform(onlyDigits)
          .refine((v) => v.length >= 10 && v.length <= 11, 'Informe o celular com DDD.'),
        incomeValue: z.number().positive('Informe o faturamento mensal aproximado.'),
        postalCode: z
          .string()
          .transform(onlyDigits)
          .refine((v) => v.length === 8, 'CEP inválido.'),
        address: z.string().trim().min(2, 'Informe a rua.').max(200),
        addressNumber: z.string().trim().min(1, 'Informe o número.').max(20),
        complement: z.string().trim().max(100).optional(),
        province: z.string().trim().min(2, 'Informe o bairro.').max(100),
      })
      .superRefine((v, ctx) => {
        if (v.cpfCnpj.length === 11 && !v.birthDate)
          ctx.addIssue({
            code: 'custom',
            message: 'Informe a data de nascimento.',
            path: ['birthDate'],
          });
        if (v.cpfCnpj.length === 14 && !v.companyType)
          ctx.addIssue({
            code: 'custom',
            message: 'Informe o tipo de empresa.',
            path: ['companyType'],
          });
      })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    const { birthDate, companyType, complement, ...rest } = parsed;
    await createCompanySubaccount(company.id, {
      ...rest,
      ...(parsed.cpfCnpj.length === 11 ? { birthDate } : { companyType }),
      ...(complement ? { complement } : {}),
    });
    revalidatePath('/configuracoes');
    revalidatePath('/link-do-cliente');
  });
}

/** PIX direto na chave do negócio: alguém da equipe confere no banco e confirma aqui. */
export async function confirmDepositReceivedAction(input: unknown) {
  return toActionResult(async () => {
    const { appointmentId } = z.object({ appointmentId: z.string().min(1) }).parse(input);
    const { company } = await requireCurrentCompany();
    const ok = await markDepositPaid(company.id, appointmentId);
    if (!ok) throw new UserError('Este agendamento não está aguardando pagamento.');
    revalidatePath('/agenda');
  });
}
