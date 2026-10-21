'use client';

import { priceLabel } from '@/lib/catalog';
import { depositAmountFor } from '@/lib/deposit';
import { formatCurrencyBRL } from '@/lib/serialize';
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  Loader2Icon,
  RotateCwIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import { addDays, type CalendarDate } from '@/lib/time';
import {
  dateKey,
  formatDuration,
  longDate,
  maskBookingPhone,
  validateBookingName,
  validateBookingPhone,
  WEEKDAY_SHORT,
  weekdayOf,
} from '@/lib/booking';
import { Input } from '@/components/ui/input';
import { BookingProgress } from '@/components/booking/booking-progress';
import { BookingSummary, type SummaryData } from '@/components/booking/booking-summary';
import { DayStrip } from '@/components/booking/day-strip';
import { TimeSlots, type Slot } from '@/components/booking/time-slots';
import { BookingSuccess } from '@/components/booking/booking-success';
import {
  createPublicBookingAction,
  getPublicAvailabilityAction,
  type PublicBookingResult,
} from '@/server/actions/public-booking-actions';

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  description: string | null;
  priceKind?: string;
};
type Professional = { id: string; name: string; color: string };
export type BookingCompany = {
  name: string;
  slug: string;
  timezone: string;
  /** "fuso de Brasília (UTC-3)" */
  timezoneLabel: string;
  address: string | null;
  mapUrl: string | null;
  cancellationPolicy: string | null;
  /** % do serviço cobrado como sinal por PIX para confirmar (0 = sem sinal). */
  depositPercent: number;
  /** false: o cliente escolhe pagar agora por PIX ou no atendimento. */
  depositRequired: boolean;
};
type Booked = Extract<PublicBookingResult, { kind: 'booked' }>;
/** O horário escolhido guarda o próprio dia: navegar por outra semana não o perde. */
type ChosenSlot = Slot & { date: CalendarDate };
type Step = 1 | 2 | 3;
const ANY = 'any';

/** Primeira frase da política como resumo; o texto inteiro fica a um toque. */
function policySummary(policy: string) {
  const first = policy.trim().split(/(?<=[.!?])\s+/)[0] ?? policy;
  return first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (!message || /fetch|network|failed|load/i.test(message)) {
    return 'Não conseguimos falar com o servidor. Confira sua internet e tente de novo — seus dados continuam aqui.';
  }
  return message;
}

/**
 * Agendamento público em três etapas — serviço e profissional, dia e horário, seus dados — e o
 * resultado. O estado fica todo aqui: voltar ou editar uma escolha não apaga o resto; se a troca
 * invalidar o horário, só ele sai, com o motivo na tela.
 */
export function BookingFlow({
  company,
  services,
  professionals,
  today,
  bookingDays,
}: {
  company: BookingCompany;
  services: Service[];
  professionals: Professional[];
  today: CalendarDate;
  bookingDays: number;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = React.useState<Step>(1);
  const [serviceId, setServiceId] = React.useState<string | null>(
    services.length === 1 ? services[0].id : null,
  );
  // Um só profissional: escolhido sozinho, e a tela diz quem atende.
  const [professionalId, setProfessionalId] = React.useState<string | null>(
    professionals.length === 1 ? professionals[0].id : null,
  );
  const [weekStart, setWeekStart] = React.useState(0);
  const [date, setDate] = React.useState<CalendarDate | null>(null);
  const [slot, setSlot] = React.useState<ChosenSlot | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [website, setWebsite] = React.useState('');
  // Sinal por PIX: a Asaas exige CPF para gerar o PIX.
  const hasDeposit = company.depositPercent > 0;
  // Opcional: o cliente escolhe. Começa em "pagar agora", que é o que garante o horário.
  const [payNow, setPayNow] = React.useState(true);
  const needsDeposit = hasDeposit && (company.depositRequired || payNow);
  const [cpf, setCpf] = React.useState('');
  const cpfDigits = cpf.replace(/\D/g, '');
  const cpfError = needsDeposit && cpfDigits.length !== 11 ? 'Informe os 11 dígitos do CPF.' : null;
  const cpfRef = React.useRef<HTMLInputElement>(null);
  const [touched, setTouched] = React.useState({ name: false, phone: false });
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = React.useState(false);
  const [booked, setBooked] = React.useState<Booked | null>(null);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const depositAmount = service ? depositAmountFor(service.price, company.depositPercent) : null;
  const professionalName = (id: string) => professionals.find((p) => p.id === id)?.name ?? null;

  // ---- Disponibilidade: a semana inteira numa chamada. A chave inclui a semana, então uma
  // resposta atrasada de outra semana nunca aparece no lugar da atual.
  const availability = useQuery({
    queryKey: ['public-availability', company.slug, serviceId, professionalId, weekStart],
    queryFn: () =>
      getPublicAvailabilityAction({
        slug: company.slug,
        serviceId,
        professionalId: professionalId === ANY ? undefined : professionalId,
        from: addDays(today, weekStart),
        days: 7,
      }).then(unwrapResult),
    enabled: step >= 2 && Boolean(serviceId && professionalId),
    staleTime: 30_000,
  });
  const week = availability.data;
  const counts = week
    ? Object.fromEntries(Object.entries(week).map(([key, slots]) => [key, slots.length]))
    : undefined;
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart + i)
    .filter((offset) => offset < bookingDays)
    .map((offset) => addDays(today, offset));
  const firstWithSlots = week
    ? weekDays.find((d) => (week[dateKey(d)]?.length ?? 0) > 0)
    : undefined;
  // Sem dia escolhido, abre no primeiro dia da semana que tem horário.
  const activeDate = date ?? firstWithSlots ?? weekDays[0];
  const daySlots = week?.[dateKey(activeDate)] ?? [];
  const weekIsEmpty = week !== undefined && weekDays.every((d) => !week[dateKey(d)]?.length);
  const canGoForward = weekStart + 7 < bookingDays;

  // ---- Foco: ao trocar de etapa, o título da etapa recebe o foco (leitor de tela e teclado).
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  function chooseService(id: string) {
    const next = services.find((s) => s.id === id);
    if (slot && service && next && next.durationMinutes !== service.durationMinutes) {
      setSlot(null);
      setNotice(
        'Você trocou o serviço e a duração mudou, então o horário foi desmarcado. Escolha outro.',
      );
    }
    setServiceId(id);
  }

  function chooseProfessional(id: string) {
    if (slot && id !== ANY && slot.professionalId !== id) {
      setSlot(null);
      setNotice('O horário escolhido era com outro profissional e foi desmarcado. Escolha outro.');
    }
    setProfessionalId(id);
  }

  function chooseDate(d: CalendarDate) {
    const offset = Math.round(
      (Date.UTC(d.year, d.month - 1, d.day) - Date.UTC(today.year, today.month - 1, today.day)) /
        86_400_000,
    );
    setWeekStart(Math.floor(offset / 7) * 7);
    setDate(d);
  }

  const nameError = validateBookingName(name);
  const phoneError = validateBookingPhone(phone);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const phoneRef = React.useRef<HTMLInputElement>(null);

  const booking = useMutation({
    mutationFn: () =>
      createPublicBookingAction({
        slug: company.slug,
        serviceId,
        professionalId: slot!.professionalId,
        startAt: slot!.startAt,
        name,
        phone,
        website,
        cpf: needsDeposit ? cpfDigits : undefined,
        payNow: hasDeposit && !company.depositRequired ? payNow : undefined,
      }).then(unwrapResult),
    onSuccess: (result) => {
      if (result.kind === 'conflict') {
        // Alguém pegou o horário: volta à escolha de horário com os dados preservados. O horário
        // sai da tela na hora — sem esperar a nova consulta, daria para clicar nele de novo.
        const taken = slot?.startAt;
        queryClient.setQueriesData<Record<string, Slot[]>>(
          { queryKey: ['public-availability'] },
          (old) =>
            old &&
            Object.fromEntries(
              Object.entries(old).map(([day, slots]) => [
                day,
                slots.filter((s) => s.startAt !== taken),
              ]),
            ),
        );
        setSlot(null);
        setNotice(`${result.message} Seus dados continuam preenchidos.`);
        void queryClient.invalidateQueries({ queryKey: ['public-availability'] });
        setStep(2);
        return;
      }
      setBooked(result);
    },
    onError: (error) => setSubmitError(friendlyError(error)),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (booking.isPending) return;
    setTouched({ name: true, phone: true });
    setSubmitError(null);
    if (nameError) return nameRef.current?.focus();
    if (phoneError) return phoneRef.current?.focus();
    if (cpfError) return cpfRef.current?.focus();
    booking.mutate();
  }

  if (booked) {
    return (
      <BookingSuccess
        booking={booked}
        company={company}
        priceKind={service?.priceKind}
        onNewBooking={() => {
          setBooked(null);
          setSlot(null);
          setDate(null);
          setNotice(null);
          booking.reset();
          void queryClient.invalidateQueries({ queryKey: ['public-availability'] });
          setStep(1);
        }}
      />
    );
  }

  const summary: SummaryData = {
    service,
    professionalName: slot
      ? professionalName(slot.professionalId)
      : professionalId === ANY
        ? 'o primeiro profissional disponível'
        : professionalId
          ? professionalName(professionalId)
          : null,
    date: slot?.date ?? null,
    time: slot?.label ?? null,
    timezoneLabel: company.timezoneLabel,
  };
  const canContinue = step === 1 ? Boolean(service && professionalId) : Boolean(slot);
  const goNext = () => {
    if (!canContinue) return;
    setNotice(null);
    setStep((s) => (s === 1 ? 2 : 3));
  };
  const selectionText = slot
    ? `${WEEKDAY_SHORT[weekdayOf(slot.date)]}, ${slot.date.day}/${slot.date.month} às ${slot.label}`
    : null;

  const headingClass = 'text-[20px] font-semibold tracking-[-0.01em] outline-none sm:text-[22px]';

  return (
    <div className={cn('flex flex-col gap-5', step < 3 && 'pb-28 lg:pb-0')}>
      <BookingProgress step={step} />

      {step > 1 && (
        <div className="lg:hidden">
          <BookingSummary
            variant="compact"
            data={summary}
            onEditService={() => setStep(1)}
            onEditTime={() => setStep(2)}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section className="bg-background border-foreground/[0.08] flex min-w-0 flex-col gap-5 rounded-2xl border p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-6">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              className="text-label-secondary hover:text-foreground -ml-1 flex items-center gap-0.5 self-start rounded-lg py-1 pr-2 text-[14px]"
            >
              <ChevronLeftIcon className="size-4" />
              Voltar
            </button>
          )}

          {notice && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl bg-[#ff9f0a]/12 px-4 py-3 text-[14px] text-[#8a4b00] dark:text-[#ffb340]"
            >
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
              {notice}
            </div>
          )}

          {step === 1 && (
            <>
              <h2 ref={headingRef} tabIndex={-1} className={headingClass}>
                Escolha o serviço
              </h2>
              {services.length === 0 ? (
                <p className="text-label-secondary text-[15px]">
                  Nenhum serviço está disponível para agendamento online no momento.
                </p>
              ) : (
                <div role="radiogroup" aria-label="Serviço" className="flex flex-col gap-2">
                  {services.map((s) => {
                    const checked = s.id === serviceId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => chooseService(s.id)}
                        className={cn(
                          'flex items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
                          checked
                            ? 'border-system-blue bg-system-blue/[0.05]'
                            : 'border-foreground/[0.1] hover:border-foreground/[0.25]',
                        )}
                      >
                        <RadioDot checked={checked} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold">{s.name}</span>
                          {s.description && (
                            <span className="text-label-secondary mt-0.5 line-clamp-2 block text-[13px]">
                              {s.description}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[15px] font-semibold tabular-nums">
                            {priceLabel(s.price, s.priceKind)}
                          </span>
                          <span className="text-label-secondary block text-[13px]">
                            {formatDuration(s.durationMinutes)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <h3 className="text-[15px] font-semibold">Profissional</h3>
                {professionals.length === 1 ? (
                  <div className="border-foreground/[0.1] flex items-center gap-3 rounded-xl border p-4">
                    <Initial name={professionals[0].name} color={professionals[0].color} />
                    <span className="text-[15px]">
                      Atendimento com{' '}
                      <strong className="font-semibold">{professionals[0].name}</strong>
                    </span>
                  </div>
                ) : (
                  <div
                    role="radiogroup"
                    aria-label="Profissional"
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    {[{ id: ANY, name: 'Primeiro disponível', color: '' }, ...professionals].map(
                      (p) => {
                        const checked = p.id === professionalId;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            onClick={() => chooseProfessional(p.id)}
                            className={cn(
                              'flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
                              checked
                                ? 'border-system-blue bg-system-blue/[0.05]'
                                : 'border-foreground/[0.1] hover:border-foreground/[0.25]',
                            )}
                          >
                            <RadioDot checked={checked} />
                            {p.id !== ANY && <Initial name={p.name} color={p.color} />}
                            <span className="min-w-0">
                              <span className="block truncate text-[15px] font-medium">
                                {p.name}
                              </span>
                              {p.id === ANY && (
                                <span className="text-label-secondary block text-[13px]">
                                  Mostra todos os horários livres
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      },
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 ref={headingRef} tabIndex={-1} className={headingClass}>
                Escolha o dia e o horário
              </h2>
              <DayStrip
                today={today}
                bookingDays={bookingDays}
                weekStart={weekStart}
                onWeekChange={(next) => {
                  setWeekStart(next);
                  setDate(null);
                }}
                selected={activeDate}
                onSelect={chooseDate}
                slotCounts={counts}
              />

              <div
                aria-live="polite"
                aria-busy={availability.isFetching}
                className="flex flex-col gap-3"
              >
                {availability.isError ? (
                  <div className="flex flex-col items-start gap-2 rounded-xl bg-[#ff3b30]/[0.07] px-4 py-3 text-[14px]">
                    <span>{friendlyError(availability.error)}</span>
                    <button
                      type="button"
                      onClick={() => void availability.refetch()}
                      className="text-system-blue flex items-center gap-1 font-medium"
                    >
                      <RotateCwIcon className="size-4" /> Tentar de novo
                    </button>
                  </div>
                ) : !week ? (
                  <div
                    className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4 sm:grid-cols-5"
                    aria-label="Carregando horários"
                  >
                    {Array.from({ length: 10 }, (_, i) => (
                      <span
                        key={i}
                        className="bg-foreground/[0.06] h-11 animate-pulse rounded-lg"
                      />
                    ))}
                  </div>
                ) : weekIsEmpty ? (
                  <EmptyState
                    title="Nenhum horário livre nesta semana"
                    text={
                      canGoForward
                        ? 'Veja a próxima semana ou volte e escolha outro profissional.'
                        : 'Tente outro profissional ou fale diretamente com o estabelecimento.'
                    }
                    action={
                      canGoForward
                        ? {
                            label: 'Ver próxima semana',
                            onClick: () => {
                              setWeekStart(weekStart + 7);
                              setDate(null);
                            },
                          }
                        : undefined
                    }
                  />
                ) : daySlots.length === 0 ? (
                  <EmptyState
                    title="Sem horários livres neste dia"
                    text="Escolha outro dia — os dias com horário têm um ponto verde."
                    action={
                      firstWithSlots
                        ? {
                            label: `Ver ${WEEKDAY_SHORT[weekdayOf(firstWithSlots)]}, ${firstWithSlots.day}`,
                            onClick: () => chooseDate(firstWithSlots),
                          }
                        : undefined
                    }
                  />
                ) : (
                  <TimeSlots
                    dayKey={dateKey(activeDate)}
                    slots={daySlots}
                    selectedStartAt={slot?.startAt ?? null}
                    onSelect={(next) => {
                      setSlot({ ...next, date: activeDate });
                      setNotice(null);
                    }}
                  />
                )}
              </div>
              <p className="text-label-secondary text-[12px]">
                Horários no {company.timezoneLabel}.
              </p>
            </>
          )}

          {step === 3 && service && slot && (
            <form noValidate onSubmit={submit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h2 ref={headingRef} tabIndex={-1} className={headingClass}>
                  Falta pouco para reservar seu horário
                </h2>
                <p className="text-label-secondary text-[15px]">
                  Preencha seus dados e confira os detalhes do agendamento.
                </p>
              </div>

              <div className="flex max-w-md flex-col gap-4">
                <Field id="booking-name" label="Nome" error={touched.name ? nameError : null}>
                  <Input
                    ref={nameRef}
                    id="booking-name"
                    name="name"
                    autoComplete="name"
                    autoCapitalize="words"
                    placeholder="Seu nome"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    aria-invalid={touched.name && Boolean(nameError)}
                    aria-describedby={touched.name && nameError ? 'booking-name-error' : undefined}
                    className={fieldClass}
                  />
                </Field>
                <Field
                  id="booking-phone"
                  label="WhatsApp com DDD"
                  hint="Outro país? Comece com + e o código do país."
                  error={touched.phone ? phoneError : null}
                >
                  <Input
                    ref={phoneRef}
                    id="booking-phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(11) 98888-7777"
                    required
                    value={phone}
                    onChange={(e) => setPhone(maskBookingPhone(e.target.value))}
                    onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                    aria-invalid={touched.phone && Boolean(phoneError)}
                    aria-describedby={
                      touched.phone && phoneError ? 'booking-phone-error' : 'booking-phone-hint'
                    }
                    className={fieldClass}
                  />
                </Field>
                {hasDeposit && !company.depositRequired && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-[15px] font-medium">Como quer pagar?</legend>
                    {[
                      {
                        value: true,
                        title:
                          company.depositPercent === 100
                            ? 'Pagar agora por PIX'
                            : `Pagar o sinal agora por PIX (${company.depositPercent}%)`,
                        desc: depositAmount
                          ? `${formatCurrencyBRL(depositAmount)} agora. O horário só fica garantido depois do pagamento.`
                          : 'O horário só fica garantido depois do pagamento.',
                      },
                      {
                        value: false,
                        title: 'Pagar no atendimento',
                        desc: 'Você reserva sem pagar agora.',
                      },
                    ].map((option) => (
                      <label
                        key={String(option.value)}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-xl border p-3',
                          payNow === option.value
                            ? 'border-system-blue bg-system-blue/[0.06]'
                            : 'border-foreground/[0.1]',
                        )}
                      >
                        <input
                          type="radio"
                          name="pay-mode"
                          className="mt-1"
                          checked={payNow === option.value}
                          onChange={() => setPayNow(option.value)}
                        />
                        <span className="flex flex-col">
                          <span className="text-[15px] font-medium">{option.title}</span>
                          <span className="text-label-secondary text-[13px]">{option.desc}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
                {needsDeposit && (
                  <Field
                    id="booking-cpf"
                    label="CPF"
                    hint={
                      company.depositPercent === 100
                        ? 'Para gerar o PIX do pagamento, que confirma o horário.'
                        : `Para o PIX do sinal de ${company.depositPercent}%, que confirma o horário.`
                    }
                    error={touched.phone && cpf ? cpfError : null}
                  >
                    <Input
                      ref={cpfRef}
                      id="booking-cpf"
                      name="cpf"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={(e) =>
                        setCpf(
                          e.target.value
                            .replace(/\D/g, '')
                            .slice(0, 11)
                            .replace(/(\d{3})(\d)/, '$1.$2')
                            .replace(/(\d{3})(\d)/, '$1.$2')
                            .replace(/(\d{3})(\d{1,2})$/, '$1-$2'),
                        )
                      }
                      className={fieldClass}
                    />
                  </Field>
                )}
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
              </div>

              {company.cancellationPolicy && (
                <div className="border-foreground/[0.08] rounded-xl border px-4 py-3 text-[14px]">
                  <p className="font-semibold">Política de cancelamento</p>
                  <p className="text-label-secondary mt-0.5 whitespace-pre-line">
                    {policyOpen
                      ? company.cancellationPolicy
                      : policySummary(company.cancellationPolicy)}
                  </p>
                  {policySummary(company.cancellationPolicy) !==
                    company.cancellationPolicy.trim() && (
                    <button
                      type="button"
                      onClick={() => setPolicyOpen((v) => !v)}
                      aria-expanded={policyOpen}
                      className="text-system-blue mt-1 text-[13px] font-medium hover:underline"
                    >
                      {policyOpen ? 'Ver resumo' : 'Ver política completa'}
                    </button>
                  )}
                </div>
              )}

              <div className="border-foreground/[0.08] flex flex-col gap-1 border-t pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-medium">Valor total</span>
                  <span className="text-[20px] font-semibold tabular-nums">
                    {priceLabel(service.price, service.priceKind)}
                  </span>
                </div>
                <p className="text-label-secondary text-[13px] first-letter:uppercase">
                  {longDate(slot.date)} às {slot.label} · {service.name}
                  {summary.professionalName ? ` com ${summary.professionalName}` : ''}
                </p>
              </div>

              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl bg-[#ff3b30]/[0.07] px-4 py-3 text-[14px]"
                >
                  <AlertCircleIcon className="text-system-red mt-0.5 size-4 shrink-0" />
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={booking.isPending}
                aria-busy={booking.isPending}
                className="bg-system-blue flex h-12 w-full items-center justify-center gap-2 rounded-lg px-6 text-[16px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-70 sm:w-auto sm:self-end"
              >
                {booking.isPending ? (
                  <>
                    <Loader2Icon className="size-5 animate-spin" /> Confirmando…
                  </>
                ) : submitError ? (
                  'Tentar de novo'
                ) : (
                  'Confirmar agendamento'
                )}
              </button>
            </form>
          )}

          {/* Ação da etapa no computador; no celular ela fica fixa na base da tela. */}
          {step < 3 && (
            <div className="border-foreground/[0.06] hidden items-center justify-end gap-4 border-t pt-4 lg:flex">
              {step === 2 && selectionText && (
                <span className="text-[14px]">
                  <span className="text-label-secondary">Selecionado: </span>
                  <strong className="font-semibold">{selectionText}</strong>
                </span>
              )}
              <ContinueButton disabled={!canContinue} onClick={goNext} />
            </div>
          )}
        </section>

        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <BookingSummary
            variant="full"
            data={summary}
            onEditService={() => setStep(1)}
            onEditTime={() => setStep(2)}
          />
        </aside>
      </div>

      {step < 3 && (
        <div className="bg-background/95 border-foreground/[0.08] fixed inset-x-0 bottom-0 z-30 border-t px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <span className="min-w-0 flex-1 text-[13px]">
              {step === 1 ? (
                service ? (
                  <>
                    <span className="block truncate font-semibold">{service.name}</span>
                    <span className="text-label-secondary">
                      {formatDuration(service.durationMinutes)} ·{' '}
                      {priceLabel(service.price, service.priceKind)}
                    </span>
                  </>
                ) : (
                  <span className="text-label-secondary">Escolha um serviço</span>
                )
              ) : selectionText ? (
                <>
                  <span className="text-label-secondary block">Selecionado</span>
                  <span className="block truncate font-semibold">{selectionText}</span>
                </>
              ) : (
                <span className="text-label-secondary">Escolha um horário</span>
              )}
            </span>
            <ContinueButton disabled={!canContinue} onClick={goNext} />
          </div>
        </div>
      )}
    </div>
  );
}

const fieldClass =
  'bg-background hover:bg-background border-foreground/[0.18] focus-visible:border-system-blue focus-visible:ring-system-blue/20 h-11 rounded-lg';

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[14px] font-medium">
        {label}{' '}
        <span className="text-system-red" aria-hidden>
          *
        </span>
        <span className="sr-only">(obrigatório)</span>
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-system-red flex items-center gap-1 text-[13px]"
        >
          <AlertCircleIcon className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-label-secondary text-[12px]">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
        checked ? 'border-system-blue bg-system-blue text-white' : 'border-foreground/[0.25]',
      )}
    >
      {checked && <CheckIcon className="size-3" strokeWidth={3.5} />}
    </span>
  );
}

function Initial({ name, color }: { name: string; color: string }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
      style={{ backgroundColor: color || '#8e8e93' }}
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

function ContinueButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="bg-system-blue h-11 shrink-0 rounded-lg px-6 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Continuar
    </button>
  );
}

function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="bg-foreground/[0.03] flex flex-col items-start gap-1 rounded-xl px-4 py-4">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="text-label-secondary text-[14px]">{text}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-system-blue mt-1 text-[14px] font-medium hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
