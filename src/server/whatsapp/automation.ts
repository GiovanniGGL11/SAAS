import { after } from 'next/server';

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { openSecret } from '@/server/secret-box';
import { getStatus, sendText, type ZapiConfig } from '@/server/whatsapp/zapi';
import { buildConfirmationMessage } from '@/server/confirmation-message';
import { buildReminderMessage } from '@/server/data/reminders';
import { signAppointmentToken } from '@/server/data/public-booking';
import { signReviewToken } from '@/server/data/relationship';
import { appBaseUrl } from '@/server/app-url';
import { addDays, startOfCalendarDateUtc, utcToCalendarDate } from '@/lib/time';

/*
  WhatsApp automático: confirmação ao marcar, lembrete na véspera, pedido de avaliação depois de
  cobrar, parabéns no aniversário e envio de campanhas. Cada mensagem tem uma chave única
  (dedupeKey): a mesma nunca sai duas vezes, mesmo com o cron rodando de novo ou dois cliques.
*/

export type AutomationKind =
  'CONFIRMATION' | 'REMINDER' | 'REVIEW' | 'BIRTHDAY' | 'CAMPAIGN' | 'TEST';

export async function getZapiConfig(companyId: string): Promise<ZapiConfig | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { zapiInstanceId: true, zapiToken: true, zapiClientToken: true },
  });
  if (!company?.zapiInstanceId || !company.zapiToken) return null;
  try {
    return {
      instanceId: company.zapiInstanceId,
      token: openSecret(company.zapiToken),
      clientToken: company.zapiClientToken ? openSecret(company.zapiClientToken) : null,
    };
  } catch (error) {
    console.error('[whatsapp] credenciais ilegíveis', companyId, error);
    return null;
  }
}

/**
 * Envia uma vez só por dedupeKey. Grava antes de enviar (PENDING) para que duas execuções ao
 * mesmo tempo não mandem em dobro; depois marca SENT ou FAILED com o erro.
 */
export async function sendOnce(params: {
  companyId: string;
  kind: AutomationKind;
  dedupeKey: string;
  phone: string | null | undefined;
  text: string;
  clientId?: string | null;
  appointmentId?: string | null;
  config?: ZapiConfig | null;
}): Promise<'sent' | 'failed' | 'skipped'> {
  if (!params.phone) return 'skipped';
  const config = params.config ?? (await getZapiConfig(params.companyId));
  if (!config) return 'skipped';
  let row;
  try {
    row = await prisma.whatsappMessage.create({
      data: {
        companyId: params.companyId,
        kind: params.kind,
        dedupeKey: params.dedupeKey,
        phone: params.phone,
        text: params.text,
        clientId: params.clientId ?? null,
        appointmentId: params.appointmentId ?? null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return 'skipped';
    throw error;
  }
  try {
    const { messageId } = await sendText(config, params.phone, params.text);
    await prisma.whatsappMessage.update({
      where: { id: row.id },
      data: { status: 'SENT', providerId: messageId },
    });
    return 'sent';
  } catch (error) {
    await prisma.whatsappMessage.update({
      where: { id: row.id },
      data: { status: 'FAILED', error: (error as Error).message.slice(0, 500) },
    });
    return 'failed';
  }
}

// ---- Gatilhos (rodam depois da resposta: salvar nunca espera o WhatsApp) -----------------------

/** Confirmação automática logo depois de marcar (pela equipe ou pelo link online). */
export function scheduleConfirmation(companyId: string, appointmentId: string) {
  after(async () => {
    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { waAutoConfirm: true },
      });
      if (!company?.waAutoConfirm) return;
      const confirmation = await buildConfirmationMessage(companyId, appointmentId);
      if (!confirmation) return;
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: { clientId: true, client: { select: { phone: true } } },
      });
      await sendOnce({
        companyId,
        kind: 'CONFIRMATION',
        dedupeKey: `confirm:${appointmentId}`,
        phone: appointment?.client.phone,
        text: confirmation.message,
        clientId: appointment?.clientId,
        appointmentId,
      });
    } catch (error) {
      console.error('[whatsapp] confirmação', appointmentId, error);
    }
  });
}

/** Pedido de avaliação logo depois de cobrar. */
export function scheduleReviewRequest(companyId: string, appointmentId: string) {
  after(async () => {
    try {
      const appointment = await prisma.appointment.findFirst({
        where: { id: appointmentId, companyId, status: 'DONE' },
        select: {
          clientId: true,
          serviceNameSnapshot: true,
          client: { select: { name: true, phone: true } },
          company: { select: { name: true, waAutoReview: true } },
        },
      });
      if (!appointment?.company.waAutoReview) return;
      const url = `${await appBaseUrl()}/avaliar/${signReviewToken(appointmentId)}`;
      await sendOnce({
        companyId,
        kind: 'REVIEW',
        dedupeKey: `review:${appointmentId}`,
        phone: appointment.client.phone,
        text: `Oi, ${appointment.client.name.split(' ')[0]}! Obrigado pela visita na ${appointment.company.name}. Como foi o seu ${appointment.serviceNameSnapshot}? Leva 10 segundos: ${url}`,
        clientId: appointment.clientId,
        appointmentId,
      });
    } catch (error) {
      console.error('[whatsapp] avaliação', appointmentId, error);
    }
  });
}

// ---- Rotina diária (cron) -------------------------------------------------------------------------

export type DailyWhatsappResult = {
  companies: number;
  reminders: number;
  birthdays: number;
  failed: number;
};

/** Lembretes de amanhã e parabéns de hoje, para cada empresa com a automação ligada. */
export async function runDailyWhatsapp(
  baseUrl: string,
  now = new Date(),
): Promise<DailyWhatsappResult> {
  const companies = await prisma.company.findMany({
    where: {
      deletedAt: null,
      zapiInstanceId: { not: null },
      zapiToken: { not: null },
      OR: [{ waAutoReminder: true }, { waAutoBirthday: true }],
    },
    select: { id: true, name: true, timezone: true, waAutoReminder: true, waAutoBirthday: true },
  });
  const result: DailyWhatsappResult = {
    companies: companies.length,
    reminders: 0,
    birthdays: 0,
    failed: 0,
  };

  for (const company of companies) {
    const config = await getZapiConfig(company.id);
    if (!config) continue;
    const today = utcToCalendarDate(now, company.timezone);

    if (company.waAutoReminder) {
      const tomorrow = addDays(today, 1);
      const appointments = await prisma.appointment.findMany({
        where: {
          companyId: company.id,
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
          startAt: {
            gte: startOfCalendarDateUtc(tomorrow, company.timezone),
            lt: startOfCalendarDateUtc(addDays(tomorrow, 1), company.timezone),
          },
        },
        include: {
          client: { select: { name: true, phone: true } },
          professional: { select: { name: true } },
        },
        take: 500,
      });
      for (const appointment of appointments) {
        const outcome = await sendOnce({
          companyId: company.id,
          kind: 'REMINDER',
          dedupeKey: `reminder:${appointment.id}`,
          phone: appointment.client.phone,
          text: buildReminderMessage(
            appointment,
            company,
            `${baseUrl}/confirmar/${signAppointmentToken(appointment.id)}`,
          ),
          clientId: appointment.clientId,
          appointmentId: appointment.id,
          config,
        });
        if (outcome === 'sent') {
          result.reminders += 1;
          await prisma.appointment.updateMany({
            where: { id: appointment.id, reminderSentAt: null },
            data: { reminderSentAt: new Date() },
          });
        } else if (outcome === 'failed') result.failed += 1;
      }
    }

    if (company.waAutoBirthday) {
      const clients = await prisma.$queryRaw<{ id: string; name: string; phone: string | null }[]>`
        SELECT id, name, phone FROM "Client"
        WHERE "companyId" = ${company.id} AND active = true AND "birthDate" IS NOT NULL AND phone IS NOT NULL
          AND EXTRACT(MONTH FROM "birthDate") = ${today.month}
          AND EXTRACT(DAY FROM "birthDate") = ${today.day}
        LIMIT 200`;
      for (const client of clients) {
        const outcome = await sendOnce({
          companyId: company.id,
          kind: 'BIRTHDAY',
          dedupeKey: `birthday:${client.id}:${today.year}`,
          phone: client.phone,
          text: `Feliz aniversário, ${client.name.split(' ')[0]}! 🎉 Toda a equipe da ${company.name} deseja um dia incrível. Quando quiser se dar um presente, é só chamar.`,
          clientId: client.id,
          config,
        });
        if (outcome === 'sent') result.birthdays += 1;
        else if (outcome === 'failed') result.failed += 1;
      }
    }
  }
  return result;
}

export async function checkZapiConnection(companyId: string) {
  const config = await getZapiConfig(companyId);
  if (!config) return null;
  return getStatus(config);
}

/**
 * Envia a campanha pela Z-API para quem ainda não recebeu, com intervalo entre as mensagens (o
 * WhatsApp bloqueia números que disparam rápido demais). No máximo 60 por vez; o resto fica para
 * um próximo clique.
 */
export function scheduleCampaignSend(companyId: string, campaignId: string, personalize: (message: string, name: string, coupon?: string | null) => string) {
  after(async () => {
    const config = await getZapiConfig(companyId);
    if (!config) return;
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, companyId },
      include: {
        recipients: {
          where: { sentAt: null },
          include: { client: { select: { id: true, name: true, phone: true } } },
          take: 60,
        },
      },
    });
    if (!campaign) return;
    for (const recipient of campaign.recipients) {
      const outcome = await sendOnce({
        companyId,
        kind: 'CAMPAIGN',
        dedupeKey: `campaign:${campaignId}:${recipient.clientId}`,
        phone: recipient.client.phone,
        text: personalize(campaign.message, recipient.client.name, campaign.couponCode),
        clientId: recipient.clientId,
        config,
      });
      if (outcome === 'sent') {
        await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { sentAt: new Date() } });
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  });
}
