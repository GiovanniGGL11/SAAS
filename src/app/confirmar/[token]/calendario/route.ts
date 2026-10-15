import { NextResponse } from 'next/server';

import { getAppointmentForToken } from '@/server/data/public-booking';
import { formatAddress } from '@/lib/address';

/** Escapa texto para o formato iCalendar (vírgula, ponto e vírgula, barra e quebra de linha). */
function ics(text: string) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** "2026-10-16T13:30:00.000Z" → "20261016T133000Z": UTC, cada calendário converte para o fuso dele. */
function icsDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * Evento .ics do agendamento ("Adicionar ao calendário" para Apple, Outlook e outros). O token é o
 * mesmo link de gerenciar que o cliente já recebeu; nenhum dado além do que ele já vê.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const appointment = await getAppointmentForToken(token);
  if (!appointment || appointment.status === 'CANCELED') {
    return NextResponse.json({ error: 'Agendamento não encontrado.' }, { status: 404 });
  }
  const address = formatAddress(appointment.company);
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Atendafy//Agendamento//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${appointment.id}@atendafy`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(appointment.startAt)}`,
    `DTEND:${icsDate(appointment.endAt)}`,
    `SUMMARY:${ics(`${appointment.serviceNameSnapshot} — ${appointment.company.name}`)}`,
    `DESCRIPTION:${ics(`Com ${appointment.professional.name}.`)}`,
    ...(address ? [`LOCATION:${ics(address)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="agendamento.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
