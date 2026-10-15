'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/db';
import { toActionResult } from '@/server/action-result';
import { UserError, parseId } from '@/server/errors';
import { requireCompanyAdmin } from '@/server/auth/require-current-company';
import { sealSecret } from '@/server/secret-box';
import {
  checkZapiConnection,
  getZapiConfig,
  scheduleCampaignSend,
  sendOnce,
} from '@/server/whatsapp/automation';
import { personalize } from '@/server/data/relationship';

const TOGGLES = ['waAutoConfirm', 'waAutoReminder', 'waAutoReview', 'waAutoBirthday'] as const;

/** O que a tela mostra: nunca devolve o token, só se ele existe. */
export async function getWhatsappSettingsAction() {
  const { company } = await requireCompanyAdmin();
  const [full, recent] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      select: {
        zapiInstanceId: true,
        zapiToken: true,
        zapiClientToken: true,
        waAutoConfirm: true,
        waAutoReminder: true,
        waAutoReview: true,
        waAutoBirthday: true,
      },
    }),
    prisma.whatsappMessage.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, kind: true, phone: true, status: true, error: true, createdAt: true },
    }),
  ]);
  return {
    configured: Boolean(full.zapiInstanceId && full.zapiToken),
    instanceId: full.zapiInstanceId,
    hasClientToken: Boolean(full.zapiClientToken),
    toggles: {
      waAutoConfirm: full.waAutoConfirm,
      waAutoReminder: full.waAutoReminder,
      waAutoReview: full.waAutoReview,
      waAutoBirthday: full.waAutoBirthday,
    },
    recent,
  };
}

export async function saveZapiCredentialsAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z
      .object({
        instanceId: z.string().trim().min(10, 'Cole o ID da instância.').max(100),
        token: z.string().trim().max(200).optional(),
        clientToken: z.string().trim().max(200).optional(),
      })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    const current = await prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      select: { zapiToken: true },
    });
    if (!parsed.token && !current.zapiToken) throw new UserError('Cole o token da instância.');
    await prisma.company.update({
      where: { id: company.id },
      data: {
        zapiInstanceId: parsed.instanceId,
        // Campo vazio = manter o que já estava salvo (a tela nunca recebe o token de volta).
        ...(parsed.token ? { zapiToken: sealSecret(parsed.token) } : {}),
        ...(parsed.clientToken ? { zapiClientToken: sealSecret(parsed.clientToken) } : {}),
      },
    });
    revalidatePath('/configuracoes');
  });
}

export async function removeZapiCredentialsAction() {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    await prisma.company.update({
      where: { id: company.id },
      data: {
        zapiInstanceId: null,
        zapiToken: null,
        zapiClientToken: null,
        waAutoConfirm: false,
        waAutoReminder: false,
        waAutoReview: false,
        waAutoBirthday: false,
      },
    });
    revalidatePath('/configuracoes');
  });
}

export async function setWhatsappAutomationAction(input: unknown) {
  return toActionResult(async () => {
    const parsed = z.object({ key: z.enum(TOGGLES), enabled: z.boolean() }).parse(input);
    const { company } = await requireCompanyAdmin();
    if (parsed.enabled && !(await getZapiConfig(company.id))) {
      throw new UserError('Conecte a Z-API antes de ligar o envio automático.');
    }
    await prisma.company.update({
      where: { id: company.id },
      data: { [parsed.key]: parsed.enabled },
    });
  });
}

export async function testZapiConnectionAction() {
  return toActionResult(async () => {
    const { company } = await requireCompanyAdmin();
    try {
      const status = await checkZapiConnection(company.id);
      if (!status) throw new UserError('Salve as credenciais da Z-API primeiro.');
      return status;
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(`Não foi possível falar com a Z-API: ${(error as Error).message}`);
    }
  });
}

export async function sendTestMessageAction(input: unknown) {
  return toActionResult(async () => {
    const { phone } = z
      .object({ phone: z.string().trim().min(10, 'Informe o número com DDD.').max(20) })
      .parse(input);
    const { company } = await requireCompanyAdmin();
    const outcome = await sendOnce({
      companyId: company.id,
      kind: 'TEST',
      dedupeKey: `test:${Date.now()}`,
      phone,
      text: `Teste do Atendafy: o WhatsApp automático da ${company.name} está funcionando. ✅`,
    });
    if (outcome === 'skipped') throw new UserError('Salve as credenciais da Z-API primeiro.');
    if (outcome === 'failed') {
      const last = await prisma.whatsappMessage.findFirst({
        where: { companyId: company.id, kind: 'TEST' },
        orderBy: { createdAt: 'desc' },
        select: { error: true },
      });
      throw new UserError(`A Z-API recusou o envio: ${last?.error ?? 'erro desconhecido'}`);
    }
  });
}

export async function sendCampaignAutomaticallyAction(rawId: unknown) {
  return toActionResult(async () => {
    const campaignId = parseId(rawId);
    const { company } = await requireCompanyAdmin();
    if (!(await getZapiConfig(company.id)))
      throw new UserError('Conecte a Z-API em Configurações para enviar automático.');
    const pending = await prisma.campaignRecipient.count({
      where: { campaignId, sentAt: null, campaign: { companyId: company.id } },
    });
    if (pending === 0) throw new UserError('Todas as mensagens desta campanha já foram enviadas.');
    scheduleCampaignSend(company.id, campaignId, personalize);
    return { queued: Math.min(pending, 60) };
  });
}
