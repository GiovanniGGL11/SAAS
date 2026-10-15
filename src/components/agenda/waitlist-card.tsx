'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, HourglassIcon, MessageCircleIcon, PlusIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { optimisticUpdate, upsertInList } from '@/lib/query-cache';
import { whatsappLink } from '@/lib/phone';
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
import { listClientsAction } from '@/server/actions/client-actions';
import {
  createWaitlistEntryAction,
  getWaitlistOpenSlotsAction,
  listWaitlistAction,
  setWaitlistStatusAction,
} from '@/server/actions/waitlist-actions';
import type { CalendarDate } from '@/lib/time';
import type { SerializedProfessional, SerializedService } from '@/lib/serialize';

type Entry = Awaited<ReturnType<typeof listWaitlistAction>>[number];
type WaitlistSlot = Awaited<ReturnType<typeof getWaitlistOpenSlotsAction>>[string][number];

const WAITLIST_KEY = ['waitlist'];

function toKey(date: CalendarDate) {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function formatDay(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
    .format(new Date(year, month - 1, day))
    .replace('.', '');
}

/** Mensagem pronta para oferecer a vaga; com horários livres, já oferece os horários. */
function offerMessage(entry: Entry, slots: WaitlistSlot[] = []) {
  const first = entry.client.name.trim().split(/\s+/)[0];
  const times = slots.map((s) => s.label);
  const when = times.length
    ? `${formatDay(entry.desiredDate)}, ${times.length === 1 ? 'às' : 'nos horários'} ${times.join(', ')}`
    : formatDay(entry.desiredDate);
  return `Olá, ${first}! Abriu uma vaga para ${entry.service.name} em ${when}. Ainda tem interesse? Se sim, é só responder aqui que eu reservo para você.`;
}

/**
 * Lista de espera: quando o dia está cheio, o cliente entra na fila; se alguém cancelar, a equipe
 * abre a lista, chama quem estava esperando pelo WhatsApp e marca como atendido.
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

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-label-secondary px-1 text-[12px] font-semibold uppercase">
        Lista de espera
      </h3>
      <Button variant="outline" className="justify-between" onClick={() => setOpen(true)}>
        <span className="flex items-center gap-2">
          <HourglassIcon className="size-4" />
          {entries.length === 0 ? 'Ninguém esperando' : `${entries.length} esperando vaga`}
        </span>
        <PlusIcon className="size-4 opacity-60" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lista de espera</DialogTitle>
            <DialogDescription>
              Dia cheio? Anote quem quer uma vaga. Se alguém cancelar, chame pelo WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <WaitlistBody
            entries={entries}
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
  anchorDate,
  services,
  professionals,
  onGoToDay,
}: {
  entries: Entry[];
  anchorDate: CalendarDate;
  services: SerializedService[];
  professionals: SerializedProfessional[];
  onGoToDay: (key: string) => void;
}) {
  const queryClient = useQueryClient();
  // Prefixo ['appointments']: toda mudança na agenda já invalida essa chave e recalcula as vagas.
  const { data: openSlots } = useQuery({
    queryKey: ['appointments', 'waitlist-open-slots'],
    queryFn: getWaitlistOpenSlotsAction,
    enabled: entries.length > 0,
  });
  const [adding, setAdding] = React.useState(false);
  const [clientId, setClientId] = React.useState('');
  const [serviceId, setServiceId] = React.useState('');
  const [professionalId, setProfessionalId] = React.useState('');
  const [date, setDate] = React.useState(toKey(anchorDate));
  const [notes, setNotes] = React.useState('');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: listClientsAction,
    enabled: adding,
  });

  const clientOptions: ComboboxOption[] = clients
    .filter((c) => c.active)
    .map((c) => ({ value: c.id, label: c.name, description: c.phone ?? undefined }));
  const serviceOptions: ComboboxOption[] = services.map((s) => ({ value: s.id, label: s.name }));
  const professionalOptions: ComboboxOption[] = [
    { value: '', label: 'Qualquer profissional' },
    ...professionals.map((p) => ({ value: p.id, label: p.name })),
  ];

  const add = useMutation({
    mutationFn: () =>
      createWaitlistEntryAction({
        clientId,
        serviceId,
        professionalId: professionalId || null,
        desiredDate: date,
        notes: notes || undefined,
      }).then(unwrapResult),
    onSuccess: (entry) => {
      toast.success('Cliente na lista de espera.');
      upsertInList(queryClient, WAITLIST_KEY, entry, 'end');
      setAdding(false);
      setClientId('');
      setNotes('');
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível adicionar.'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: WAITLIST_KEY }),
  });

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
    onSettled: () => queryClient.invalidateQueries({ queryKey: WAITLIST_KEY }),
  });

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
      {entries.length === 0 && !adding && (
        <p className="text-label-secondary py-6 text-center text-sm">
          Ninguém na lista de espera agora.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {entries.map((entry) => {
          const slots = openSlots?.[entry.id] ?? [];
          const link = whatsappLink(entry.client.phone, offerMessage(entry, slots));
          return (
            <li key={entry.id} className="bg-foreground/[0.04] rounded-2xl p-3.5 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{entry.client.name}</div>
                  <div className="text-label-secondary text-[13px] break-words">
                    {entry.service.name}
                    {entry.professional ? ` · ${entry.professional.name}` : ''}
                  </div>
                  {entry.notes && (
                    <div className="text-label-secondary mt-0.5 text-[12px] break-words">
                      “{entry.notes}”
                    </div>
                  )}
                  {openSlots && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {slots.length ? (
                        <>
                          <span className="text-system-green text-[12px] font-semibold">
                            Vaga agora:
                          </span>
                          {slots.map((s) => (
                            <span
                              key={s.startAt}
                              className="bg-system-green/12 text-system-green rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums"
                              title={s.professionalName}
                            >
                              {s.label}
                            </span>
                          ))}
                        </>
                      ) : (
                        <span className="text-label-secondary text-[12px]">Sem vaga ainda</span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onGoToDay(entry.desiredDate)}
                  className="text-system-blue shrink-0 text-[13px] font-medium capitalize hover:underline"
                  title="Ver este dia na agenda"
                >
                  {formatDay(entry.desiredDate)}
                </button>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {link && (
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
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate();
          }}
        >
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
          <Input
            placeholder="Observação (ex.: só de manhã)"
            maxLength={300}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={!clientId || !serviceId || !date || add.isPending}>
              {add.isPending ? 'Salvando…' : 'Adicionar à lista'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
          <PlusIcon className="size-4" />
          Adicionar à lista
        </Button>
      )}
    </div>
  );
}
