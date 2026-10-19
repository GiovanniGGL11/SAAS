'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckIcon,
  CopyIcon,
  HourglassIcon,
  MessageCircleIcon,
  PlusIcon,
  SendIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { optimisticUpdate, upsertInList } from '@/lib/query-cache';
import { whatsappLink } from '@/lib/phone';
import { WEEKDAY_SHORT, preferencesLabel } from '@/lib/waitlist';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listClientsAction } from '@/server/actions/client-actions';
import {
  cancelWaitlistOfferAction,
  createWaitlistEntryAction,
  createWaitlistOfferAction,
  getWaitlistCapabilitiesAction,
  getWaitlistOpenSlotsAction,
  listWaitlistAction,
  listWaitlistOffersAction,
  respondWaitlistOfferAction,
  setWaitlistStatusAction,
} from '@/server/actions/waitlist-actions';
import type { CalendarDate } from '@/lib/time';
import type { SerializedProfessional, SerializedService } from '@/lib/serialize';

type Entry = Awaited<ReturnType<typeof listWaitlistAction>>[number];
type WaitlistSlot = Awaited<ReturnType<typeof getWaitlistOpenSlotsAction>>[string][number];
type Offer = Awaited<ReturnType<typeof listWaitlistOffersAction>>[number];

const WAITLIST_KEY = ['waitlist'];
const OFFERS_KEY = ['appointments', 'waitlist-offers'];

const RESPONSE_OPTIONS = [
  { value: '30', label: '30 minutos' },
  { value: '60', label: '1 hora' },
  { value: '120', label: '2 horas' },
  { value: '240', label: '4 horas' },
  { value: '1440', label: '24 horas' },
];

const CHANNEL_LABEL = {
  WHATSAPP: 'WhatsApp',
  PHONE: 'Ligação',
  EMAIL: 'E-mail',
  NONE: 'Não chamar (só presencial)',
} as const;

function toKey(date: CalendarDate) {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function formatDay(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
    .format(new Date(year, month - 1, day))
    .replace('.', '');
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

function timeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Mensagem pronta para avisar (plano sem convite com prazo): o dia e, se houver, os horários. */
function noticeMessage(entry: Entry, slots: WaitlistSlot[] = []) {
  const first = entry.client.name.trim().split(/\s+/)[0];
  const when = slots.length
    ? slots.map((s) => `${formatDay(s.dayKey)} ${s.label}`).join(', ')
    : entry.desiredDate
      ? formatDay(entry.desiredDate)
      : 'os próximos dias';
  return `Olá, ${first}! Abriu uma vaga para ${entry.service.name}: ${when}. Ainda tem interesse? Se sim, é só responder aqui que eu reservo para você.`;
}

/**
 * Lista de espera: quem quer uma vaga entra com um dia ou com preferências. Quando abre um
 * horário compatível, a equipe convida UMA pessoa com prazo de resposta (o horário fica
 * segurado) e registra a resposta — aceitar já cria o agendamento, revalidando a agenda.
 */
export function WaitlistCard({
  anchorDate,
  services,
  professionals,
  onDateSelect,
}: {
  anchorDate: CalendarDate;
  services: SerializedService[];
  professionals: SerializedProfessional[];
  onDateSelect: (date: CalendarDate) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const { data: entries = [] } = useQuery({
    queryKey: WAITLIST_KEY,
    queryFn: listWaitlistAction,
    staleTime: 60_000,
  });
  const { data: offers = [] } = useQuery({
    queryKey: OFFERS_KEY,
    queryFn: listWaitlistOffersAction,
    staleTime: 60_000,
  });
  const pending = offers.filter((o) => o.status === 'PENDING').length;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-label-secondary px-1 text-[12px] font-semibold uppercase">
        Lista de espera
      </h3>
      <Button variant="outline" className="justify-between" onClick={() => setOpen(true)}>
        <span className="flex items-center gap-2">
          <HourglassIcon className="size-4" />
          {entries.length === 0 ? 'Ninguém esperando' : `${entries.length} esperando vaga`}
          {pending > 0 && (
            <span className="bg-system-orange/15 text-system-orange rounded-full px-2 py-0.5 text-[11px] font-semibold">
              {pending} convite{pending > 1 ? 's' : ''}
            </span>
          )}
        </span>
        <PlusIcon className="size-4 opacity-60" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lista de espera</DialogTitle>
            <DialogDescription>
              Anote quem quer uma vaga. Quando abrir um horário compatível, convide uma pessoa por
              vez — o horário fica guardado até o prazo de resposta.
            </DialogDescription>
          </DialogHeader>
          <WaitlistBody
            entries={entries}
            offers={offers}
            anchorDate={anchorDate}
            services={services}
            professionals={professionals}
            onGoToDay={(key) => {
              const [year, month, day] = key.split('-').map(Number);
              onDateSelect({ year, month, day });
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

function WaitlistBody({
  entries,
  offers,
  anchorDate,
  services,
  professionals,
  onGoToDay,
}: {
  entries: Entry[];
  offers: Offer[];
  anchorDate: CalendarDate;
  services: SerializedService[];
  professionals: SerializedProfessional[];
  onGoToDay: (key: string) => void;
}) {
  const queryClient = useQueryClient();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Prefixo ['appointments']: toda mudança na agenda já invalida essa chave e recalcula as vagas.
  const { data: openSlots } = useQuery({
    queryKey: ['appointments', 'waitlist-open-slots'],
    queryFn: getWaitlistOpenSlotsAction,
    enabled: entries.length > 0,
  });
  const { data: caps } = useQuery({
    queryKey: ['waitlist-capabilities'],
    queryFn: getWaitlistCapabilitiesAction,
    staleTime: 5 * 60_000,
  });
  const invites = caps?.invites ?? false;
  const [adding, setAdding] = React.useState(false);
  const [inviting, setInviting] = React.useState<{ entry: Entry; slot: WaitlistSlot } | null>(null);
  const [sent, setSent] = React.useState<{ message: string; whatsappUrl: string | null } | null>(
    null,
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: WAITLIST_KEY });
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
  };

  const resolve = useMutation({
    mutationFn: (input: { id: string; status: 'FULFILLED' | 'CANCELED' }) =>
      setWaitlistStatusAction(input).then(unwrapResult),
    // Some da lista na hora; volta se o servidor recusar.
    onMutate: async ({ id }) => ({
      rollback: await optimisticUpdate<Entry[]>(queryClient, WAITLIST_KEY, (list) =>
        list.filter((entry) => entry.id !== id),
      ),
    }),
    onError: (error: Error, _input, context) => {
      context?.rollback();
      toast.error(error.message || 'Não foi possível atualizar.');
    },
    onSettled: refresh,
  });

  const respond = useMutation({
    mutationFn: (input: { id: string; accept: boolean }) =>
      respondWaitlistOfferAction(input).then(unwrapResult),
    onSuccess: (result) =>
      toast.success(
        result.appointmentId ? 'Agendado! O horário já está na agenda.' : 'Registrado.',
      ),
    onError: (error: Error) =>
      toast.error(error.message || 'Não foi possível registrar.', { duration: 9000 }),
    onSettled: refresh,
  });

  const cancelOffer = useMutation({
    mutationFn: (id: string) => cancelWaitlistOfferAction({ id }).then(unwrapResult),
    onSuccess: () => toast.success('Convite cancelado; o horário foi liberado.'),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível cancelar.'),
    onSettled: refresh,
  });

  const pendingOffers = offers.filter((o) => o.status === 'PENDING');

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
      {pendingOffers.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-label-secondary text-[12px] font-semibold uppercase">
            Convites aguardando resposta
          </span>
          {pendingOffers.map((offer) => (
            <div
              key={offer.id}
              className="border-system-orange/30 bg-system-orange/[0.06] rounded-2xl border p-3 text-sm"
            >
              <div className="font-medium">{offer.entry.client.name}</div>
              <div className="text-label-secondary text-[13px]">
                {offer.entry.service.name} ·{' '}
                {new Intl.DateTimeFormat('pt-BR', {
                  weekday: 'short',
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(offer.startAt))}
              </div>
              <div className="text-system-orange text-[12px]">
                Horário guardado até {formatTime(new Date(offer.expiresAt).toISOString())}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ id: offer.id, accept: true })}
                >
                  <CheckIcon className="size-3.5" /> Aceitou — agendar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ id: offer.id, accept: false })}
                >
                  Recusou
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={cancelOffer.isPending}
                  onClick={() => cancelOffer.mutate(offer.id)}
                >
                  Cancelar convite
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 && !adding && (
        <p className="text-label-secondary py-6 text-center text-sm">
          Ninguém na lista de espera agora. Quando o dia estiver cheio, anote aqui quem quer vaga.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {entries.map((entry) => {
          const slots = openSlots?.[entry.id] ?? [];
          const hasOffer = entry.offers.length > 0;
          const link =
            entry.contactChannel === 'WHATSAPP'
              ? whatsappLink(entry.client.phone, noticeMessage(entry, slots))
              : null;
          return (
            <li key={entry.id} className="bg-foreground/[0.04] rounded-2xl p-3.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{entry.client.name}</div>
                  <div className="text-label-secondary text-[13px] break-words">
                    {entry.service.name}
                    {entry.professional ? ` · ${entry.professional.name}` : ''}
                    {entry.acceptedProfessionalIds.length > 1 &&
                      ` · ${entry.acceptedProfessionalIds.length} profissionais aceitos`}
                  </div>
                  <div className="text-label-secondary text-[12px]">
                    {preferencesLabel(
                      {
                        ...entry,
                        validUntil: entry.validUntil ? new Date(entry.validUntil) : null,
                      },
                      timezone,
                    )}{' '}
                    · chamar por {CHANNEL_LABEL[entry.contactChannel].toLowerCase()}
                  </div>
                  {entry.notes && (
                    <div className="text-label-secondary mt-0.5 text-[12px] break-words">
                      “{entry.notes}”
                    </div>
                  )}
                  {hasOffer ? (
                    <div className="text-system-orange mt-1.5 text-[12px] font-medium">
                      Convite enviado — aguardando resposta
                    </div>
                  ) : (
                    openSlots && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {slots.length ? (
                          <>
                            <span className="text-system-green text-[12px] font-semibold">
                              Vaga agora:
                            </span>
                            {slots.map((s) => (
                              <button
                                key={`${s.startAt}-${s.professionalId}`}
                                type="button"
                                disabled={!invites}
                                onClick={() => setInviting({ entry, slot: s })}
                                className={cn(
                                  'bg-system-green/12 text-system-green rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums',
                                  invites && 'hover:bg-system-green/20 cursor-pointer',
                                )}
                                title={
                                  invites
                                    ? `Convidar para ${formatDay(s.dayKey)} ${s.label} (${s.professionalName})`
                                    : s.professionalName
                                }
                              >
                                {entry.desiredDate ? '' : `${formatDay(s.dayKey)} `}
                                {s.label}
                              </button>
                            ))}
                          </>
                        ) : (
                          <span className="text-label-secondary text-[12px]">Sem vaga ainda</span>
                        )}
                      </div>
                    )
                  )}
                </div>
                {entry.desiredDate && (
                  <button
                    type="button"
                    onClick={() => onGoToDay(entry.desiredDate!)}
                    className="text-system-blue shrink-0 text-[13px] font-medium capitalize hover:underline"
                    title="Ver este dia na agenda"
                  >
                    {formatDay(entry.desiredDate)}
                  </button>
                )}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {!invites && link && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={link} target="_blank" rel="noreferrer">
                      <MessageCircleIcon className="size-3.5" />
                      Avisar
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolve.mutate({ id: entry.id, status: 'FULFILLED' })}
                >
                  <CheckIcon className="size-3.5" />
                  Agendado
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => resolve.mutate({ id: entry.id, status: 'CANCELED' })}
                >
                  <XIcon className="size-3.5" />
                  Remover
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <AddEntryForm
          anchorDate={anchorDate}
          services={services}
          professionals={professionals}
          advanced={invites}
          onDone={(entry) => {
            if (entry) upsertInList(queryClient, WAITLIST_KEY, entry, 'end');
            setAdding(false);
            refresh();
          }}
        />
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
          <PlusIcon className="size-4" />
          Adicionar à lista
        </Button>
      )}

      {inviting && (
        <InviteDialog
          entry={inviting.entry}
          slot={inviting.slot}
          onClose={() => setInviting(null)}
          onSent={(result) => {
            setInviting(null);
            setSent(result);
            refresh();
          }}
        />
      )}
      <Dialog open={sent !== null} onOpenChange={(o: boolean) => !o && setSent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convite registrado</DialogTitle>
            <DialogDescription>
              O horário está guardado. Envie a mensagem pelo seu WhatsApp e registre a resposta em
              “Convites aguardando resposta”. Nenhuma mensagem é enviada automaticamente.
            </DialogDescription>
          </DialogHeader>
          <p className="bg-foreground/[0.04] rounded-xl p-3 text-[13px]">{sent?.message}</p>
          <div className="flex flex-wrap gap-2">
            {sent?.whatsappUrl && (
              <Button asChild>
                <a href={sent.whatsappUrl} target="_blank" rel="noreferrer">
                  <SendIcon className="size-4" /> Abrir no WhatsApp
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(sent?.message ?? '')
                  .then(() => toast.success('Mensagem copiada.'));
              }}
            >
              <CopyIcon className="size-4" /> Copiar mensagem
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteDialog({
  entry,
  slot,
  onClose,
  onSent,
}: {
  entry: Entry;
  slot: WaitlistSlot;
  onClose: () => void;
  onSent: (result: { message: string; whatsappUrl: string | null }) => void;
}) {
  const [minutes, setMinutes] = React.useState('120');
  const invite = useMutation({
    mutationFn: () =>
      createWaitlistOfferAction({
        entryId: entry.id,
        professionalId: slot.professionalId,
        startAt: slot.startAt,
        responseMinutes: Number(minutes),
      }).then(unwrapResult),
    onSuccess: (result) => onSent(result),
    onError: (error: Error) =>
      toast.error(error.message || 'Não foi possível convidar.', { duration: 9000 }),
  });
  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar {entry.client.name.split(/\s+/)[0]}</DialogTitle>
          <DialogDescription>
            {entry.service.name} · {formatDay(slot.dayKey)} às {slot.label} com{' '}
            {slot.professionalName}. O horário fica guardado para esta pessoa até o prazo; se ela
            não responder, ele volta a ficar livre.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-label-secondary text-[12px]">Prazo para responder</span>
          <Select value={minutes} onValueChange={setMinutes}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESPONSE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex gap-2">
          <Button disabled={invite.isPending} onClick={() => invite.mutate()}>
            {invite.isPending ? 'Guardando horário…' : 'Convidar e guardar horário'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddEntryForm({
  anchorDate,
  services,
  professionals,
  advanced,
  onDone,
}: {
  anchorDate: CalendarDate;
  services: SerializedService[];
  professionals: SerializedProfessional[];
  advanced: boolean;
  onDone: (entry: Entry | null) => void;
}) {
  const [mode, setMode] = React.useState<'day' | 'prefs'>('day');
  const [clientId, setClientId] = React.useState('');
  const [serviceId, setServiceId] = React.useState('');
  const [professionalId, setProfessionalId] = React.useState('');
  const [accepted, setAccepted] = React.useState<string[]>([]);
  const [weekdays, setWeekdays] = React.useState<number[]>([]);
  const [timeFrom, setTimeFrom] = React.useState('');
  const [timeTo, setTimeTo] = React.useState('');
  const [validUntil, setValidUntil] = React.useState('');
  const [channel, setChannel] = React.useState<keyof typeof CHANNEL_LABEL>('WHATSAPP');
  const [date, setDate] = React.useState(toKey(anchorDate));
  const [notes, setNotes] = React.useState('');

  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: listClientsAction });
  const clientOptions: ComboboxOption[] = clients
    .filter((c) => c.active)
    .map((c) => ({ value: c.id, label: c.name, description: c.phone ?? undefined }));
  const serviceOptions: ComboboxOption[] = services.map((s) => ({ value: s.id, label: s.name }));
  const professionalOptions: ComboboxOption[] = [
    { value: '', label: 'Qualquer profissional' },
    ...professionals.map((p) => ({ value: p.id, label: p.name })),
  ];

  const prefsMode = advanced && mode === 'prefs';
  const add = useMutation({
    mutationFn: () =>
      createWaitlistEntryAction({
        clientId,
        serviceId,
        professionalId: prefsMode ? null : professionalId || null,
        desiredDate: prefsMode ? null : date,
        ...(prefsMode
          ? {
              acceptedProfessionalIds: accepted,
              weekdays,
              timeFrom: timeToMinutes(timeFrom),
              timeTo: timeToMinutes(timeTo),
              validUntil: validUntil || null,
            }
          : {}),
        contactChannel: channel,
        notes: notes || undefined,
      }).then(unwrapResult),
    onSuccess: (entry) => {
      toast.success('Cliente na lista de espera.');
      onDone(entry);
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível adicionar.'),
  });

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      {advanced && (
        <SegmentedControl
          size="sm"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'day', label: 'Dia específico' },
            { value: 'prefs', label: 'Preferências' },
          ]}
        />
      )}
      <Combobox
        options={clientOptions}
        value={clientId}
        onChange={setClientId}
        placeholder="Cliente"
        searchPlaceholder="Buscar cliente…"
      />
      <Combobox
        options={serviceOptions}
        value={serviceId}
        onChange={setServiceId}
        placeholder="Serviço"
      />
      {prefsMode ? (
        <>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-label-secondary mb-1 text-[12px]">
              Profissionais aceitos (nenhum marcado = qualquer um)
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {professionals.map((p) => (
                <ToggleChip
                  key={p.id}
                  active={accepted.includes(p.id)}
                  onClick={() => setAccepted(toggle(accepted, p.id))}
                >
                  {p.name}
                </ToggleChip>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-label-secondary mb-1 text-[12px]">
              Dias da semana (nenhum marcado = qualquer dia)
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_SHORT.map((label, index) => (
                <ToggleChip
                  key={label}
                  active={weekdays.includes(index)}
                  onClick={() => setWeekdays(toggle(weekdays, index))}
                >
                  {label}
                </ToggleChip>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-label-secondary">A partir de</span>
              <Input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-label-secondary">Até</span>
              <Input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="text-label-secondary">Interesse vale até (opcional)</span>
            <Input
              type="date"
              value={validUntil}
              min={toKey(anchorDate)}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </label>
        </>
      ) : (
        <>
          <Combobox
            options={professionalOptions}
            value={professionalId}
            onChange={setProfessionalId}
            placeholder="Qualquer profissional"
          />
          <Input
            type="date"
            aria-label="Dia desejado"
            value={date}
            min={toKey(anchorDate)}
            onChange={(event) => setDate(event.target.value)}
          />
        </>
      )}
      <label className="flex flex-col gap-1 text-[12px]">
        <span className="text-label-secondary">Como o cliente autorizou ser chamado</span>
        <Select value={channel} onValueChange={(v: string) => setChannel(v as typeof channel)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <Input
        placeholder="Observação (ex.: prefere a sala 2)"
        maxLength={300}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={!clientId || !serviceId || (!prefsMode && !date) || add.isPending}
        >
          {add.isPending ? 'Salvando…' : 'Adicionar à lista'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone(null)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-[13px] font-medium transition-colors',
        active
          ? 'bg-system-blue text-white'
          : 'bg-foreground/[0.06] text-label-secondary hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
