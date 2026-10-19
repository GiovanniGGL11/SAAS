'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CalendarPlusIcon,
  CheckIcon,
  Loader2Icon,
  LogOutIcon,
  MessageCircleIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { whatsappLink } from '@/lib/phone';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import {
  addDays,
  formatTimeInTz,
  isSameCalendarDate,
  utcToCalendarDate,
  type CalendarDate,
} from '@/lib/time';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { LoyaltyCard } from '@/components/fidelidade/loyalty-card';
import { PortalExtrasSections } from '@/components/client-portal/portal-extras';
import type { PortalExtras } from '@/server/data/client-portal';
import {
  cancelMyAppointmentAction,
  confirmMyAppointmentAction,
  getMyRescheduleSlotsAction,
  rescheduleMyAppointmentAction,
  signOutPortalAction,
} from '@/server/actions/client-portal-actions';
import type { PortalAppointment, PortalOverview } from '@/server/data/client-portal';

const WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** Mesmo alcance do agendamento online. */
const DAYS_AHEAD = 21;

const STATUS: Record<string, { label: string; className: string }> = {
  SCHEDULED: {
    label: 'A confirmar',
    className: 'bg-[#ff9f0a]/14 text-[#b25f00] dark:text-[#ffb340]',
  },
  CONFIRMED: { label: 'Confirmado', className: 'bg-system-green/12 text-system-green' },
  IN_PROGRESS: { label: 'Em atendimento', className: 'bg-system-blue/12 text-system-blue' },
  DONE: { label: 'Concluído', className: 'text-label-secondary' },
  CANCELED: { label: 'Cancelado', className: 'text-system-red' },
  NO_SHOW: { label: 'Não compareceu', className: 'text-label-secondary' },
};

type Company = { name: string; slug: string; timezone: string; whatsapp: string | null };

function weekdayOf(d: CalendarDate) {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

function dateKey(d: CalendarDate) {
  return `${d.year}-${d.month}-${d.day}`;
}

/** "Hoje", "Amanhã" ou "Qua, 14 out" — montado à mão para sair igual no servidor e no celular. */
function dayLabel(d: CalendarDate, today: CalendarDate) {
  if (isSameCalendarDate(d, today)) return 'Hoje';
  if (isSameCalendarDate(d, addDays(today, 1))) return 'Amanhã';
  return `${WEEKDAY[weekdayOf(d)]}, ${d.day} ${MONTH[d.month - 1]}`;
}

export function ClientPortal({
  clientName,
  company,
  overview,
  extras,
  onlineBooking,
  today,
}: {
  clientName: string;
  company: Company;
  overview: PortalOverview;
  /** Área ampliada (plano Profissional em diante); `null` quando o plano não inclui. */
  extras: PortalExtras | null;
  onlineBooking: boolean;
  today: CalendarDate;
}) {
  const router = useRouter();
  const firstName = clientName.trim().split(/\s+/)[0];
  const [rescheduling, setRescheduling] = React.useState<PortalAppointment | null>(null);
  const [canceling, setCanceling] = React.useState<PortalAppointment | null>(null);

  const chatUrl = whatsappLink(company.whatsapp, `Olá! Aqui é ${clientName}.`);
  const bookingUrl = onlineBooking ? `/agendar/${company.slug}` : null;

  const done = (message: string) => {
    toast.success(message);
    router.refresh();
  };
  const fail = (error: Error) => toast.error(error.message);

  const confirm = useMutation({
    mutationFn: (id: string) => confirmMyAppointmentAction(id).then(unwrapResult),
    onSuccess: () => done('Presença confirmada. Até lá!'),
    onError: fail,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelMyAppointmentAction(id).then(unwrapResult),
    onSuccess: () => {
      setCanceling(null);
      done('Horário cancelado.');
    },
    onError: fail,
  });

  const signOut = useMutation({
    mutationFn: () => signOutPortalAction(),
    onSuccess: () => router.replace(`/cliente/entrar/${company.slug}`),
  });

  return (
    <main className="font-apple mx-auto flex w-full max-w-md flex-1 flex-col gap-7 p-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:p-6">
      <header className="flex flex-col gap-0.5 pt-3">
        <p className="text-label-secondary text-[13px] font-medium">{company.name}</p>
        <h1 className="text-[30px] leading-tight font-bold tracking-[-0.025em]">
          Olá, {firstName}
        </h1>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">Próximos horários</h2>
        {overview.upcoming.length === 0 ? (
          <div className="bg-tile flex flex-col items-center gap-2 rounded-[22px] px-6 py-8 text-center">
            <p className="text-[15px] font-medium">Nenhum horário marcado</p>
            <p className="text-label-secondary text-[13px]">
              {bookingUrl
                ? 'Escolha um dia e horário quando quiser.'
                : 'Fale com a gente para marcar o próximo.'}
            </p>
          </div>
        ) : (
          overview.upcoming.map((appointment) => (
            <UpcomingCard
              key={appointment.id}
              appointment={appointment}
              timezone={company.timezone}
              today={today}
              canReschedule={onlineBooking}
              chatUrl={chatUrl}
              noticeHours={overview.noticeHours}
              confirming={confirm.isPending && confirm.variables === appointment.id}
              onConfirm={() => confirm.mutate(appointment.id)}
              onReschedule={() => setRescheduling(appointment)}
              onCancel={() => setCanceling(appointment)}
            />
          ))
        )}
      </section>

      {(bookingUrl || chatUrl) && (
        <div className="grid grid-cols-2 gap-3">
          {bookingUrl && (
            <QuickAction href={bookingUrl} icon={CalendarPlusIcon} color="#007aff">
              Agendar horário
            </QuickAction>
          )}
          {chatUrl && (
            <QuickAction href={chatUrl} icon={MessageCircleIcon} color="#34c759" external>
              Falar no WhatsApp
            </QuickAction>
          )}
        </div>
      )}

      {extras && <PortalExtrasSections extras={extras} timezone={company.timezone} />}

      {overview.loyalty && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-semibold">Fidelidade</h2>
          <LoyaltyCard
            rules={overview.loyalty.rules}
            balance={overview.loyalty.balance}
            holder={clientName}
          />
        </section>
      )}

      {overview.history.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-semibold">Histórico</h2>
          <ul className="bg-tile divide-foreground/[0.06] divide-y overflow-hidden rounded-[22px]">
            {overview.history.map((appointment) => {
              const d = utcToCalendarDate(new Date(appointment.startAt), company.timezone);
              const status = STATUS[appointment.status];
              return (
                <li key={appointment.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{appointment.service}</div>
                    <div className="text-label-secondary truncate text-[13px]">
                      {d.day} {MONTH[d.month - 1]} {d.year} · {appointment.professional.name}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {appointment.status === 'DONE' ? (
                      <div className="text-[15px] tabular-nums">
                        {formatCurrencyBRL(appointment.price)}
                      </div>
                    ) : null}
                    <div className={cn('text-[12px]', status?.className)}>{status?.label}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <footer className="flex flex-col items-center gap-3 pt-2">
        <Button
          variant="ghost"
          className="text-label-secondary"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          <LogOutIcon className="size-4" />
          Sair deste aparelho
        </Button>
        <span className="text-label-secondary text-[12px]">Atendafy</span>
      </footer>

      <RescheduleSheet
        appointment={rescheduling}
        timezone={company.timezone}
        today={today}
        onClose={() => setRescheduling(null)}
        onDone={() => {
          setRescheduling(null);
          done('Horário remarcado.');
        }}
      />

      <ConfirmDialog
        open={canceling !== null}
        title="Cancelar este horário?"
        description={
          canceling
            ? `${canceling.service} · ${dayLabel(
                utcToCalendarDate(new Date(canceling.startAt), company.timezone),
                today,
              )} às ${formatTimeInTz(new Date(canceling.startAt), company.timezone)}. O horário fica livre para outra pessoa.`
            : undefined
        }
        confirmLabel={cancel.isPending ? 'Cancelando…' : 'Cancelar horário'}
        destructive
        pending={cancel.isPending}
        onConfirm={() => canceling && cancel.mutate(canceling.id)}
        onOpenChange={(open: boolean) => !open && setCanceling(null)}
      />
    </main>
  );
}

function QuickAction({
  href,
  icon: Icon,
  color,
  external,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="bg-tile hover:bg-foreground/[0.06] flex flex-col gap-3 rounded-[22px] p-4 transition-colors"
    >
      <span
        className="flex size-9 items-center justify-center rounded-[11px] text-white"
        style={{ backgroundColor: color }}
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="text-[15px] leading-tight font-medium">{children}</span>
    </a>
  );
}

function UpcomingCard({
  appointment,
  timezone,
  today,
  canReschedule,
  chatUrl,
  noticeHours,
  confirming,
  onConfirm,
  onReschedule,
  onCancel,
}: {
  appointment: PortalAppointment;
  timezone: string;
  today: CalendarDate;
  canReschedule: boolean;
  chatUrl: string | null;
  noticeHours: number;
  confirming: boolean;
  onConfirm: () => void;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const start = new Date(appointment.startAt);
  const d = utcToCalendarDate(start, timezone);
  const status = STATUS[appointment.status];
  const awaitingConfirmation = appointment.status === 'SCHEDULED';
  const lateForChanges =
    !appointment.canChange && ['SCHEDULED', 'CONFIRMED'].includes(appointment.status);

  return (
    <article className="bg-tile flex flex-col gap-4 rounded-[22px] p-4">
      <div className="flex gap-4">
        <div className="bg-system-blue flex w-[60px] shrink-0 flex-col items-center justify-center rounded-2xl py-2 text-white">
          <span className="text-[11px] font-semibold uppercase opacity-85">
            {WEEKDAY[weekdayOf(d)]}
          </span>
          <span className="text-[24px] leading-none font-bold tabular-nums">{d.day}</span>
          <span className="text-[11px] opacity-85">{MONTH[d.month - 1]}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[17px] font-semibold tabular-nums">
              {dayLabel(d, today)} · {formatTimeInTz(start, timezone)}
            </span>
          </div>
          <span className="truncate text-[15px]">{appointment.service}</span>
          <span className="text-label-secondary flex items-center gap-1.5 truncate text-[13px]">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: appointment.professional.color }}
            />
            com {appointment.professional.name}
          </span>
          {status && (
            <span
              className={cn(
                'mt-1 w-fit rounded-full px-2 py-0.5 text-[12px] font-medium',
                status.className,
              )}
            >
              {status.label}
            </span>
          )}
        </div>
      </div>

      {(awaitingConfirmation || appointment.canChange) && (
        <div className="flex flex-wrap gap-2">
          {awaitingConfirmation && (
            <Button size="sm" className="flex-1" disabled={confirming} onClick={onConfirm}>
              {confirming ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <CheckIcon className="size-4" />
              )}
              Confirmar presença
            </Button>
          )}
          {appointment.canChange && canReschedule && (
            <Button size="sm" variant="outline" className="flex-1" onClick={onReschedule}>
              Remarcar
            </Button>
          )}
          {appointment.canChange && (
            <Button size="sm" variant="ghost" className="text-system-red flex-1" onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
      )}

      {lateForChanges && (
        <p className="text-label-secondary text-[13px]">
          Faltam menos de {noticeHours} horas: para mudar,{' '}
          {chatUrl ? (
            <a className="text-system-blue" href={chatUrl} target="_blank" rel="noreferrer">
              fale com a gente no WhatsApp
            </a>
          ) : (
            'fale com a gente'
          )}
          .
        </p>
      )}
    </article>
  );
}

function RescheduleSheet({
  appointment,
  timezone,
  today,
  onClose,
  onDone,
}: {
  appointment: PortalAppointment | null;
  timezone: string;
  today: CalendarDate;
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = React.useState<CalendarDate>(today);
  const [slot, setSlot] = React.useState<{ startAt: string; label: string } | null>(null);
  // O último aberto continua na tela enquanto a folha desce, em vez de sumir no meio da animação.
  const [shown, setShown] = React.useState(appointment);
  const [previous, setPrevious] = React.useState(appointment);

  // Cada vez que a folha abre, a escolha começa do zero, no dia de hoje.
  if (appointment !== previous) {
    setPrevious(appointment);
    if (appointment) {
      setShown(appointment);
      setDate(today);
      setSlot(null);
    }
  }

  const appointmentId = shown?.id;
  const slots = useQuery({
    queryKey: ['portal-slots', appointmentId, dateKey(date)],
    queryFn: () => getMyRescheduleSlotsAction({ appointmentId, date }).then(unwrapResult),
    enabled: appointment !== null,
  });

  const save = useMutation({
    mutationFn: () =>
      rescheduleMyAppointmentAction({ appointmentId, startAt: slot!.startAt }).then(unwrapResult),
    onSuccess: onDone,
    onError: (error: Error) => {
      toast.error(error.message);
      setSlot(null);
      void slots.refetch();
    },
  });

  const current = shown ? new Date(shown.startAt) : null;

  return (
    <Drawer
      direction="bottom"
      open={appointment !== null}
      onOpenChange={(open: boolean) => !open && onClose()}
    >
      <DrawerContent className="sm:mx-auto sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle className="text-[17px] font-semibold">Remarcar horário</DrawerTitle>
          {shown && current && (
            <DrawerDescription>
              {shown.service} com {shown.professional.name}, marcado para{' '}
              {dayLabel(utcToCalendarDate(current, timezone), today).toLowerCase()} às{' '}
              {formatTimeInTz(current, timezone)}.
            </DrawerDescription>
          )}
        </DrawerHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i)).map((d) => {
              const selected = isSameCalendarDate(d, date);
              return (
                <button
                  key={dateKey(d)}
                  type="button"
                  onClick={() => {
                    setDate(d);
                    setSlot(null);
                  }}
                  className={cn(
                    'flex w-14 shrink-0 flex-col items-center rounded-2xl py-2 text-[12px] transition-colors',
                    selected ? 'bg-system-blue text-white' : 'bg-tile hover:bg-foreground/[0.06]',
                  )}
                >
                  <span className={selected ? 'text-white/80' : 'text-label-secondary'}>
                    {WEEKDAY[weekdayOf(d)]}
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
            <div className="text-label-secondary flex items-center justify-center gap-2 py-8 text-sm">
              <Loader2Icon className="size-4 animate-spin" /> Buscando horários…
            </div>
          ) : slots.error ? (
            <p className="text-destructive py-6 text-center text-sm">
              {(slots.error as Error).message}
            </p>
          ) : (slots.data ?? []).length === 0 ? (
            <p className="text-label-secondary py-8 text-center text-sm">
              Nenhum horário livre neste dia. Tente outro.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {slots.data!.map((s) => {
                const selected = slot?.startAt === s.startAt;
                return (
                  <button
                    key={s.startAt}
                    type="button"
                    onClick={() => setSlot(s)}
                    aria-pressed={selected}
                    className={cn(
                      'rounded-xl py-2.5 text-[15px] font-medium tabular-nums transition-colors',
                      selected ? 'bg-system-blue text-white' : 'bg-tile hover:bg-foreground/[0.06]',
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DrawerFooter>
          <Button size="lg" disabled={!slot || save.isPending} onClick={() => save.mutate()}>
            {save.isPending
              ? 'Remarcando…'
              : slot
                ? `Remarcar para ${dayLabel(date, today).toLowerCase()} às ${slot.label}`
                : 'Escolha um horário'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
