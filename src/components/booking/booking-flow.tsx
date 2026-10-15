'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2Icon, ChevronLeftIcon, Loader2Icon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { addDays, type CalendarDate } from '@/lib/time';
import { formatCurrencyBRL } from '@/lib/serialize';
import { unwrapResult } from '@/lib/action-result';
import {
  createPublicBookingAction,
  getPublicSlotsAction,
} from '@/server/actions/public-booking-actions';

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  description: string | null;
};
type Professional = { id: string; name: string; color: string };

const WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DAYS = 21;

function dateKey(d: CalendarDate) {
  return `${d.year}-${d.month}-${d.day}`;
}

/** Serviço → profissional → dia e horário → nome e telefone. Uma decisão por tela, como no celular. */
export function BookingFlow({
  slug,
  services,
  professionals,
  today,
  cancellationPolicy,
}: {
  /** Mostrada antes de confirmar: o cliente sabe as regras antes de reservar. */
  cancellationPolicy?: string | null;
  slug: string;
  services: Service[];
  professionals: Professional[];
  today: CalendarDate;
}) {
  const [service, setService] = React.useState<Service | null>(null);
  const [professionalId, setProfessionalId] = React.useState<string | 'any' | null>(
    professionals.length === 1 ? professionals[0].id : null,
  );
  const [date, setDate] = React.useState<CalendarDate>(today);
  const [slot, setSlot] = React.useState<{
    startAt: string;
    professionalId: string;
    label: string;
  } | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [website, setWebsite] = React.useState('');

  const step = !service ? 'service' : !professionalId ? 'professional' : !slot ? 'time' : 'details';

  const slots = useQuery({
    queryKey: ['public-slots', slug, service?.id, professionalId, dateKey(date)],
    queryFn: () =>
      getPublicSlotsAction({
        slug,
        serviceId: service!.id,
        professionalId: professionalId === 'any' ? undefined : professionalId!,
        date,
      }).then(unwrapResult),
    enabled: step === 'time',
  });

  const booking = useMutation({
    mutationFn: () =>
      createPublicBookingAction({
        slug,
        serviceId: service!.id,
        professionalId: slot!.professionalId,
        startAt: slot!.startAt,
        name,
        phone,
        website,
      }).then(unwrapResult),
  });

  if (booking.isSuccess) {
    const day = new Date(slot!.startAt);
    return (
      <div className="bg-tile flex flex-col items-center gap-3 rounded-[22px] p-8 text-center">
        <CheckCircle2Icon className="text-system-green size-12" />
        <h2 className="text-[22px] font-semibold">Horário reservado!</h2>
        <p className="text-label-secondary text-[15px]">
          {service!.name} · {WEEKDAY[day.getDay()]}, {date.day} de {MONTH[date.month - 1]} às{' '}
          {slot!.label}
        </p>
        <p className="text-label-secondary text-[13px]">
          Guarde este link para confirmar ou cancelar depois:
          <br />
          <a
            className="text-system-blue break-all underline"
            href={`/confirmar/${booking.data.token}`}
          >
            {typeof window !== 'undefined' ? window.location.origin : ''}/confirmar/
            {booking.data.token}
          </a>
        </p>
      </div>
    );
  }

  const back = () => {
    if (step === 'details') setSlot(null);
    else if (step === 'time') {
      if (professionals.length > 1) setProfessionalId(null);
      else setService(null);
    } else if (step === 'professional') setService(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {step !== 'service' && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={back} aria-label="Voltar">
            <ChevronLeftIcon className="size-5" />
          </Button>
          <div className="text-label-secondary text-[13px]">
            {service?.name}
            {professionalId &&
              professionalId !== 'any' &&
              ` · ${professionals.find((p) => p.id === professionalId)?.name}`}
            {slot && ` · ${date.day}/${date.month} às ${slot.label}`}
          </div>
        </div>
      )}

      {step === 'service' && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[17px] font-semibold">Escolha o serviço</h2>
          {services.length === 0 && (
            <p className="text-label-secondary text-sm">Nenhum serviço disponível.</p>
          )}
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setService(s)}
              className="bg-tile hover:bg-foreground/[0.06] flex items-center justify-between gap-3 rounded-2xl p-4 text-left"
            >
              <span>
                <span className="block font-medium">{s.name}</span>
                <span className="text-label-secondary text-[13px]">{s.durationMinutes} min</span>
              </span>
              <span className="font-semibold tabular-nums">{formatCurrencyBRL(s.price)}</span>
            </button>
          ))}
        </section>
      )}

      {step === 'professional' && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[17px] font-semibold">Com quem?</h2>
          <button
            type="button"
            onClick={() => setProfessionalId('any')}
            className="bg-tile hover:bg-foreground/[0.06] rounded-2xl p-4 text-left font-medium"
          >
            Qualquer profissional
            <span className="text-label-secondary block text-[13px] font-normal">
              Mostra todos os horários livres
            </span>
          </button>
          {professionals.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProfessionalId(p.id)}
              className="bg-tile hover:bg-foreground/[0.06] flex items-center gap-3 rounded-2xl p-4 text-left font-medium"
            >
              <span className="size-3 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
          ))}
        </section>
      )}

      {step === 'time' && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-semibold">Escolha o dia e o horário</h2>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {Array.from({ length: DAYS }, (_, i) => addDays(today, i)).map((d) => {
              const weekday = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
              const selected = dateKey(d) === dateKey(date);
              return (
                <button
                  key={dateKey(d)}
                  type="button"
                  onClick={() => setDate(d)}
                  className={cn(
                    'flex w-14 shrink-0 flex-col items-center rounded-2xl py-2 text-[12px]',
                    selected ? 'bg-system-blue text-white' : 'bg-tile hover:bg-foreground/[0.06]',
                  )}
                >
                  <span className={selected ? 'text-white/80' : 'text-label-secondary'}>
                    {WEEKDAY[weekday]}
                  </span>
                  <span className="text-[17px] font-semibold">{d.day}</span>
                  <span className={selected ? 'text-white/80' : 'text-label-secondary'}>
                    {MONTH[d.month - 1]}
                  </span>
                </button>
              );
            })}
          </div>
          {slots.isLoading ? (
            <div className="text-label-secondary flex items-center gap-2 py-6 text-sm">
              <Loader2Icon className="size-4 animate-spin" /> Buscando horários...
            </div>
          ) : slots.error ? (
            <p className="text-destructive text-sm">{(slots.error as Error).message}</p>
          ) : (slots.data ?? []).length === 0 ? (
            <p className="text-label-secondary py-6 text-sm">
              Nenhum horário livre neste dia. Tente outro.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {slots.data!.map((s) => (
                <button
                  key={s.startAt}
                  type="button"
                  onClick={() => setSlot(s)}
                  className="bg-tile hover:bg-system-blue rounded-xl py-2.5 text-[15px] font-medium tabular-nums hover:text-white"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {step === 'details' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            booking.mutate();
          }}
        >
          <h2 className="text-[17px] font-semibold">Seus dados</h2>
          <Input
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
          <Input
            placeholder="WhatsApp com DDD"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            autoComplete="tel"
          />
          {/* Isca para robôs: invisível para pessoas. */}
          <input
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            name="website"
          />
          {cancellationPolicy && (
            <div className="bg-foreground/[0.04] rounded-2xl px-4 py-3 text-[13px]">
              <p className="font-semibold">Política de cancelamento</p>
              <p className="text-label-secondary mt-0.5 whitespace-pre-line">
                {cancellationPolicy}
              </p>
            </div>
          )}
          {booking.error && (
            <p className="text-destructive text-sm">{(booking.error as Error).message}</p>
          )}
          <Button type="submit" className="h-11" disabled={booking.isPending}>
            {booking.isPending
              ? 'Reservando...'
              : `Confirmar ${slot!.label} · ${formatCurrencyBRL(service!.price)}`}
          </Button>
        </form>
      )}
    </div>
  );
}
