import { after } from 'next/server';

import { prisma } from '@/lib/db';
import { companyHasFeature, featureAccessFor } from '@/server/billing/features';
import { TRIAL_GRANT, getPlan } from '@/lib/billing/plans';
import {
  officialWhatsappReady,
  sendOfficialTemplate,
  type OfficialTemplate,
} from '@/server/whatsapp/cloud-api';
import { Prisma } from '@/generated/prisma/client';
import { openSecret } from '@/server/secret-box';
import { getStatus, sendText, type ZapiConfig } from '@/server/whatsapp/zapi';
import { buildConfirmationMessage } from '@/server/confirmation-message';
import { buildReminderMessage } from '@/server/data/reminders';
import { signAppointmentToken } from '@/server/data/public-booking';
import { signReviewToken } from '@/server/data/relationship';
import { optOutUrl, withOptOutFooter } from '@/server/data/marketing-consent';
import { appBaseUrl } from '@/server/app-url';
import { addDays, formatTimeInTz, startOfCalendarDateUtc, utcToCalendarDate } from '@/lib/time';

/*
  WhatsApp automático: confirmação ao marcar, lembrete na véspera, pedido de avaliação depois de
  cobrar, parabéns no aniversário e envio de campanhas. Cada mensagem tem uma chave única
  (dedupeKey): a mesma nunca sai duas vezes, mesmo com o cron rodando de novo ou dois cliques.
*/

export type AutomationKind =
  | 'CONFIRMATION'
  | 'REMINDER'
  | 'REVIEW'
  | 'BIRTHDAY'
  | 'CAMPAIGN'
  | 'TEST'
  // Convite automático da lista de espera (só com integração, janela de contato e autorização).
  | 'WAITLIST_OFFER';

export async function getZapiConfig(companyId: string): Promise<ZapiConfig | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { zapiInstanceId: true, zapiToken: true, zapiClientToken: true },
  });
  if (!company?.zapiInstanceId || !company.zapiToken) return null;
  if (!(await companyHasFeature(companyId, 'whatsappAutomation'))) return null;
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
 * Confirmações e lembretes pelo WhatsApp oficial do Atendafy (incluídos no plano): quantos o plano
 * dá por mês e quantos já saíram. Sem o WhatsApp oficial configurado, nada é incluído.
 */
export async function officialAllowance(
  companyId: string,
  now = new Date(),
): Promise<{ ready: boolean; included: number; used: number }> {
  if (!officialWhatsappReady()) return { ready: false, included: 0, used: 0 };
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      courtesyUntil: true,
      courtesyPlan: true,
    },
  });
  if (!company) return { ready: true, included: 0, used: 0 };
  const access = featureAccessFor(company, now);
  const included =
    access.entitlements.source === 'trial'
      ? TRIAL_GRANT.includedWhatsappMessages
      : (getPlan(access.planId)?.includedWhatsappMessages ?? 0);
  const used = await prisma.whatsappMessage.count({
    where: {
      companyId,
      channel: 'official',
      status: { not: 'FAILED' },
      createdAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) },
    },
  });
  return { ready: true, included, used };
}

/**
 * Campos do modelo oficial de confirmação/lembrete: nome, salão, quando (com serviço e
 * profissional) e o link para confirmar ou cancelar.
 */
async function appointmentTemplateValues(appointmentId: string, url: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      startAt: true,
      serviceNameSnapshot: true,
      client: { select: { name: true } },
      professional: { select: { name: true } },
      company: { select: { name: true, timezone: true } },
    },
  });
  if (!appointment) return null;
  const { timezone } = appointment.company;
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  }).format(appointment.startAt);
  return [
    appointment.client.name.trim().split(/\s+/)[0],
    appointment.company.name,
    `${day} às ${formatTimeInTz(appointment.startAt, timezone)} · ${appointment.serviceNameSnapshot} com ${appointment.professional.name}`,
    url,
  ];
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
  /**
   * Sem a Z-API do salão, confirmação e lembrete podem sair pelo WhatsApp oficial do Atendafy
   * (modelo aprovado), dentro do que o plano inclui no mês.
   */
  official?: { template: OfficialTemplate; values: string[] } | null;
}): Promise<'sent' | 'failed' | 'skipped'> {
  if (!params.phone) return 'skipped';
  const config = params.config ?? (await getZapiConfig(params.companyId));
  let channel: 'zapi' | 'official' = 'zapi';
  if (!config) {
    if (!params.official) return 'skipped';
    const { included, used } = await officialAllowance(params.companyId);
    if (used >= included) return 'skipped';
    channel = 'official';
  }
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
        channel,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return 'skipped';
    throw error;
  }
  try {
    const { messageId } =
      channel === 'zapi'
        ? await sendText(config!, params.phone, params.text)
        : await sendOfficialTemplate({
            to: params.phone,
            template: params.official!.template,
            values: params.official!.values,
          });
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
      const values = await appointmentTemplateValues(appointmentId, confirmation.url);
      await sendOnce({
        companyId,
        kind: 'CONFIRMATION',
        dedupeKey: `confirm:${appointmentId}`,
        phone: appointment?.client.phone,
        text: confirmation.message,
        clientId: appointment?.clientId,
        appointmentId,
        official: values ? { template: 'confirmation', values } : null,
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
  /** Só esta empresa (testes: o banco é compartilhado e nunca deve tocar empresa real). */
  onlyCompanyId?: string,
): Promise<DailyWhatsappResult> {
  const companies = await prisma.company.findMany({
    where: {
      ...(onlyCompanyId ? { id: onlyCompanyId } : {}),
      deletedAt: null,
      // Com a Z-API do salão ou, só para lembretes, pelo WhatsApp oficial incluído no plano.
      OR: [
        { waAutoReminder: true },
        { waAutoBirthday: true, zapiInstanceId: { not: null }, zapiToken: { not: null } },
      ],
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
    const allowance = config ? null : await officialAllowance(company.id, now);
    const official = Boolean(allowance && allowance.included > allowance.used);
    if (!config && !official) continue;
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
        const url = `${baseUrl}/confirmar/${signAppointmentToken(appointment.id)}`;
        const values = config ? null : await appointmentTemplateValues(appointment.id, url);
        const outcome = await sendOnce({
          companyId: company.id,
          kind: 'REMINDER',
          dedupeKey: `reminder:${appointment.id}`,
          phone: appointment.client.phone,
          text: buildReminderMessage(appointment, company, url),
          clientId: appointment.clientId,
          appointmentId: appointment.id,
          config,
          official: values ? { template: 'reminder', values } : null,
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

    // Parabéns é promoção: só pelo número do salão (o WhatsApp oficial cobra muito mais por isso).
    if (company.waAutoBirthday && config) {
      const clients = await prisma.$queryRaw<{ id: string; name: string; phone: string | null }[]>`
        SELECT id, name, phone FROM "Client"
        WHERE "companyId" = ${company.id} AND active = true AND "birthDate" IS NOT NULL AND phone IS NOT NULL
          AND "marketingOptOutAt" IS NULL
          AND EXTRACT(MONTH FROM "birthDate") = ${today.month}
          AND EXTRACT(DAY FROM "birthDate") = ${today.day}
        LIMIT 200`;
      for (const client of clients) {
        const outcome = await sendOnce({
          companyId: company.id,
          kind: 'BIRTHDAY',
          dedupeKey: `birthday:${client.id}:${today.year}`,
          phone: client.phone,
          text: withOptOutFooter(
            `Feliz aniversário, ${client.name.split(' ')[0]}! 🎉 Toda a equipe da ${company.name} deseja um dia incrível. Quando quiser se dar um presente, é só chamar.`,
            optOutUrl(baseUrl, client.id),
          ),
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
export function scheduleCampaignSend(
  companyId: string,
  campaignId: string,
  personalize: (message: string, name: string, coupon?: string | null) => string,
) {
  after(async () => {
    const config = await getZapiConfig(companyId);
    if (!config) return;
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, companyId },
      include: {
        recipients: {
          where: { sentAt: null },
          include: {
            client: { select: { id: true, name: true, phone: true, marketingOptOutAt: true } },
          },
          take: 60,
        },
      },
    });
    if (!campaign) return;
    const baseUrl = await appBaseUrl();
    for (const recipient of campaign.recipients) {
      // Pediu para não receber promoções (mesmo depois de a campanha ser criada): pula.
      if (recipient.client.marketingOptOutAt) continue;
      const outcome = await sendOnce({
        companyId,
        kind: 'CAMPAIGN',
        dedupeKey: `campaign:${campaignId}:${recipient.clientId}`,
        phone: recipient.client.phone,
        text: withOptOutFooter(
          personalize(campaign.message, recipient.client.name, campaign.couponCode),
          optOutUrl(baseUrl, recipient.clientId),
        ),
        clientId: recipient.clientId,
        config,
      });
      if (outcome === 'sent') {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { sentAt: new Date() },
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  });
}
