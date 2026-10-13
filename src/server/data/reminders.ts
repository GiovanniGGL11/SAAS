import { prisma } from '@/lib/db';
import { whatsappLink } from '@/lib/phone';
import { addDays, formatTimeInTz, startOfCalendarDateUtc, utcToCalendarDate } from '@/lib/time';
import { appBaseUrl } from '@/server/app-url';
import { signAppointmentToken } from '@/server/data/public-booking';
import type { EmailSender } from '@/server/email';

/** Atendimentos de amanhã (no fuso da empresa) que ainda podem acontecer. */
const reminderInclude = {
  client: { select: { name: true, phone: true, email: true } },
  professional: { select: { name: true } },
} as const;

function tomorrowRange(timezone: string, now: Date) {
  const tomorrow = addDays(utcToCalendarDate(now, timezone), 1);
  return {
    start: startOfCalendarDateUtc(tomorrow, timezone),
    end: startOfCalendarDateUtc(addDays(tomorrow, 1), timezone),
  };
}

type ReminderAppointment = {
  id: string;
  startAt: Date;
  serviceNameSnapshot: string;
  client: { name: string };
  professional: { name: string };
};

/** Texto do lembrete (e-mail e WhatsApp), com o link em que o cliente confirma ou cancela. */
export function buildReminderMessage(
  appointment: ReminderAppointment,
  company: { name: string; timezone: string },
  confirmUrl: string,
): string {
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: company.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(appointment.startAt);
  const firstName = appointment.client.name.trim().split(/\s+/)[0];
  return [
    `Olá, ${firstName}! Lembrete do seu horário na ${company.name}:`,
    '',
    `📅 ${day} às ${formatTimeInTz(appointment.startAt, company.timezone)}`,
    `🛎️ ${appointment.serviceNameSnapshot} com ${appointment.professional.name}`,
    '',
    `Confirme sua presença por aqui: ${confirmUrl}`,
    '',
    'Se não puder comparecer, é só cancelar pelo mesmo link para liberarmos o horário.',
  ].join('\n');
}

export type TomorrowReminder = {
  id: string;
  startAt: Date;
  /** Hora no fuso da empresa (HH:MM). */
  timeLabel: string;
  clientName: string;
  serviceName: string;
  professionalName: string;
  message: string;
  whatsappUrl: string | null;
  hasEmail: boolean;
  sent: boolean;
};

/** A fila de lembretes de amanhã que a equipe vê na Agenda. */
export async function listTomorrowReminders(
  company: { id: string; name: string; timezone: string },
  now = new Date(),
): Promise<TomorrowReminder[]> {
  const { start, end } = tomorrowRange(company.timezone, now);
  const [appointments, baseUrl] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        companyId: company.id,
        startAt: { gte: start, lt: end },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
      },
      include: reminderInclude,
      orderBy: { startAt: 'asc' },
      take: 200,
    }),
    appBaseUrl(),
  ]);

  return appointments.map((appointment) => {
    const message = buildReminderMessage(
      appointment,
      company,
      `${baseUrl}/confirmar/${signAppointmentToken(appointment.id)}`,
    );
    return {
      id: appointment.id,
      startAt: appointment.startAt,
      timeLabel: formatTimeInTz(appointment.startAt, company.timezone),
      clientName: appointment.client.name,
      serviceName: appointment.serviceNameSnapshot,
      professionalName: appointment.professional.name,
      message,
      whatsappUrl: whatsappLink(appointment.client.phone, message),
      hasEmail: Boolean(appointment.client.email),
      sent: appointment.reminderSentAt !== null,
    };
  });
}

export async function markReminderSent(companyId: string, appointmentId: string): Promise<void> {
  await prisma.appointment.updateMany({
    where: { id: appointmentId, companyId, reminderSentAt: null },
    data: { reminderSentAt: new Date() },
  });
}

export async function setCompanyRemindersByEmail(companyId: string, enabled: boolean) {
  await prisma.company.update({ where: { id: companyId }, data: { remindersByEmail: enabled } });
}

export type ReminderRunResult = { companies: number; sent: number; failed: number };

/**
 * Chamado todo dia pelo cron: para cada empresa com o lembrete por e-mail ligado, manda o e-mail
 * dos atendimentos de amanhã que ainda não foram avisados e têm e-mail cadastrado. Cada envio é
 * marcado na hora, então rodar duas vezes não manda duas vezes.
 */
export async function sendEmailReminders(
  send: EmailSender,
  baseUrl: string,
  now = new Date(),
): Promise<ReminderRunResult> {
  const companies = await prisma.company.findMany({
    where: { remindersByEmail: true, deletedAt: null },
    select: { id: true, name: true, timezone: true },
  });
  const result: ReminderRunResult = { companies: companies.length, sent: 0, failed: 0 };

  for (const company of companies) {
    const { start, end } = tomorrowRange(company.timezone, now);
    const appointments = await prisma.appointment.findMany({
      where: {
        companyId: company.id,
        startAt: { gte: start, lt: end },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        reminderSentAt: null,
        client: { email: { not: null } },
      },
      include: reminderInclude,
      take: 500,
    });

    for (const appointment of appointments) {
      const to = appointment.client.email;
      if (!to) continue;
      try {
        await send({
          to,
          subject: `Lembrete: seu horário na ${company.name}`,
          text: buildReminderMessage(
            appointment,
            company,
            `${baseUrl}/confirmar/${signAppointmentToken(appointment.id)}`,
          ),
        });
        await markReminderSent(company.id, appointment.id);
        result.sent += 1;
      } catch (error) {
        result.failed += 1;
        console.error('[reminders] falha ao enviar', appointment.id, error);
      }
    }
  }
  return result;
}
