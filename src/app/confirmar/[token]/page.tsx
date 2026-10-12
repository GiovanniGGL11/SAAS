import { CalendarCheck2Icon, CalendarXIcon } from 'lucide-react';

import { getAppointmentForToken } from '@/server/data/public-booking';
import { AppointmentResponse } from '@/components/booking/appointment-response';
import { formatTimeInTz } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Seu horário' };

const STATUS_TEXT: Record<string, string> = {
  SCHEDULED: 'Aguardando sua confirmação',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  DONE: 'Concluído',
  CANCELED: 'Cancelado',
  NO_SHOW: 'Não compareceu',
};

/** Página renderizada por requisição (force-dynamic): "agora" é o momento do pedido. */
function isUpcoming(at: Date): boolean {
  return at.getTime() > Date.now();
}

/** O cliente abre o link do WhatsApp e confirma ou cancela o próprio horário, sem login. */
export default async function ConfirmarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const appointment = await getAppointmentForToken(token);

  if (!appointment) {
    return (
      <main className="font-apple flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <CalendarXIcon className="text-label-secondary size-10" />
        <h1 className="text-[22px] font-semibold">Link inválido</h1>
        <p className="text-label-secondary text-[15px]">Peça um novo link ao estabelecimento.</p>
      </main>
    );
  }

  const tz = appointment.company.timezone;
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(appointment.startAt);
  const canRespond =
    (appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED') &&
    isUpcoming(appointment.startAt);

  return (
    <main className="font-apple mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <div className="bg-tile flex flex-col gap-4 rounded-[22px] p-6">
        <CalendarCheck2Icon className="text-system-blue size-9" />
        <div>
          <p className="text-label-secondary text-[13px]">{appointment.company.name}</p>
          <h1 className="text-[22px] leading-tight font-semibold">
            Olá, {appointment.client.name.split(' ')[0]}!
          </h1>
        </div>
        <div className="flex flex-col gap-1 text-[15px]">
          <span className="font-medium first-letter:uppercase">
            {date} às {formatTimeInTz(appointment.startAt, tz)}
          </span>
          <span className="text-label-secondary">
            {appointment.serviceNameSnapshot} com {appointment.professional.name}
          </span>
          <span className="text-label-secondary">Situação: {STATUS_TEXT[appointment.status]}</span>
        </div>
        {canRespond && <AppointmentResponse token={token} status={appointment.status} />}
      </div>
    </main>
  );
}
