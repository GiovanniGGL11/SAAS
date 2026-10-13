import { prisma } from '@/lib/db';
import { whatsappLink } from '@/lib/phone';
import { formatTimeInTz } from '@/lib/time';
import { appBaseUrl } from '@/server/app-url';
import { signAppointmentToken } from '@/server/data/public-booking';

export type ConfirmationMessage = {
  /** Link em que o cliente confirma ou cancela sozinho. */
  url: string;
  message: string;
  /** Nulo quando o cliente não tem celular cadastrado: a equipe ainda pode copiar a mensagem. */
  whatsappUrl: string | null;
  clientName: string;
};

/**
 * Mensagem de WhatsApp pedindo que o cliente confirme a presença, com o link de confirmação.
 * Sempre filtra pela empresa: o id do agendamento vem do navegador.
 */
export async function buildConfirmationMessage(
  companyId: string,
  appointmentId: string,
): Promise<ConfirmationMessage | null> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, companyId },
    select: {
      id: true,
      startAt: true,
      serviceNameSnapshot: true,
      client: { select: { name: true, phone: true } },
      professional: { select: { name: true } },
      company: { select: { name: true, timezone: true } },
    },
  });
  if (!appointment) return null;

  const { timezone, name: companyName } = appointment.company;
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(appointment.startAt);
  const url = `${await appBaseUrl()}/confirmar/${signAppointmentToken(appointment.id)}`;
  const firstName = appointment.client.name.trim().split(/\s+/)[0];

  const message = [
    `Olá, ${firstName}! Seu horário na ${companyName} está reservado:`,
    '',
    `📅 ${day} às ${formatTimeInTz(appointment.startAt, timezone)}`,
    `✂️ ${appointment.serviceNameSnapshot} com ${appointment.professional.name}`,
    '',
    `Por favor, confirme sua presença por aqui: ${url}`,
    '',
    'Se não puder comparecer, é só cancelar pelo mesmo link.',
  ].join('\n');

  return {
    url,
    message,
    whatsappUrl: whatsappLink(appointment.client.phone, message),
    clientName: appointment.client.name,
  };
}
