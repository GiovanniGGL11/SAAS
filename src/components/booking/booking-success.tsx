'use client';

import * as React from 'react';
import { CalendarPlusIcon, CheckCircle2Icon, MapPinIcon } from 'lucide-react';

import { priceLabel } from '@/lib/catalog';
import { formatTimeInTz, utcToCalendarDate } from '@/lib/time';
import { formatDuration, longDate } from '@/lib/booking';
import { Button } from '@/components/ui/button';
import type { PublicBookingResult } from '@/server/actions/public-booking-actions';
import { DepositPayment } from '@/components/booking/deposit-payment';

type Booked = Extract<PublicBookingResult, { kind: 'booked' }>;

/** "2026-10-16T13:30:00.000Z" → "20261016T133000Z" (formato do Google Agenda, sempre em UTC). */
function googleDate(iso: string) {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Depois da resposta do servidor, nunca antes. O status é o verdadeiro: a reserva entra direto na
 * agenda. Não dizemos que mandamos WhatsApp — o sistema não envia mensagem automática aqui.
 */
export function BookingSuccess({
  booking,
  company,
  onNewBooking,
  priceKind,
}: {
  booking: Booked;
  /** Tipo de preço do serviço no catálogo ("a partir de", "sob consulta"). */
  priceKind?: string;
  company: { name: string; timezone: string; address: string | null; mapUrl: string | null };
  onNewBooking: () => void;
}) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => headingRef.current?.focus(), []);

  const start = new Date(booking.startAt);
  const end = new Date(booking.endAt);
  const day = utcToCalendarDate(start, company.timezone);
  const manageUrl = `/confirmar/${booking.token}`;
  const googleUrl = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: `${booking.serviceName} — ${company.name}`,
    dates: `${googleDate(booking.startAt)}/${googleDate(booking.endAt)}`,
    ctz: company.timezone,
    details: `Com ${booking.professionalName}.`,
    ...(company.address ? { location: company.address } : {}),
  }).toString()}`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <section className="bg-background border-foreground/[0.08] flex flex-col gap-5 rounded-2xl border p-6 sm:p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <CheckCircle2Icon className="text-system-green size-12" aria-hidden />
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-[24px] font-semibold tracking-[-0.01em] outline-none"
          >
            {booking.deposit ? 'Falta só o sinal' : 'Horário reservado'}
          </h1>
          <p className="text-label-secondary text-[15px]">
            Seu horário já está na agenda de {company.name}.
          </p>
        </div>

        {booking.deposit && (
          <DepositPayment
            token={booking.token}
            deposit={booking.deposit}
            timezone={company.timezone}
          />
        )}

        <div className="bg-system-blue/[0.06] rounded-xl p-4 text-center">
          <p className="text-[17px] font-semibold first-letter:uppercase">{longDate(day)}</p>
          <p className="text-system-blue text-[28px] leading-tight font-bold tabular-nums">
            {formatTimeInTz(start, company.timezone)}
            <span className="text-label-secondary text-[17px] font-medium">
              {' '}
              – {formatTimeInTz(end, company.timezone)}
            </span>
          </p>
        </div>

        <dl className="divide-foreground/[0.06] divide-y text-[14px]">
          {[
            ['Serviço', booking.serviceName],
            ['Profissional', booking.professionalName],
            ['Duração', formatDuration(booking.durationMinutes)],
            ['Valor', priceLabel(booking.price, priceKind)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 py-2.5">
              <dt className="text-label-secondary">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
          {company.address && (
            <div className="flex justify-between gap-3 py-2.5">
              <dt className="text-label-secondary">Endereço</dt>
              <dd className="text-right">
                {company.mapUrl ? (
                  <a
                    href={company.mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-system-blue inline-flex items-start gap-1 hover:underline"
                  >
                    <MapPinIcon className="mt-0.5 size-3.5 shrink-0" />
                    {company.address}
                  </a>
                ) : (
                  company.address
                )}
              </dd>
            </div>
          )}
        </dl>

        <div className="flex flex-col gap-2">
          <Button asChild className="h-11 rounded-lg shadow-none">
            <a href={manageUrl}>Gerenciar agendamento</a>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" className="h-11 rounded-lg">
              <a href={googleUrl} target="_blank" rel="noreferrer">
                <CalendarPlusIcon className="size-4" />
                Google Agenda
              </a>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-lg">
              <a href={`${manageUrl}/calendario`} download="agendamento.ics">
                <CalendarPlusIcon className="size-4" />
                Outro calendário
              </a>
            </Button>
          </div>
          <p className="text-label-secondary text-center text-[12px]">
            Em &ldquo;Gerenciar agendamento&rdquo; você confirma presença ou cancela. Guarde o link.
          </p>
        </div>
      </section>

      <button
        type="button"
        onClick={onNewBooking}
        className="text-system-blue self-center rounded-lg px-3 py-2 text-[14px] font-medium hover:underline"
      >
        Fazer outro agendamento
      </button>
    </div>
  );
}
