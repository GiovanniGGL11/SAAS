'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClockIcon, UserRoundIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { ConfirmationToSend } from '@/components/agenda/send-confirmation-dialog';
import { unwrapResult } from '@/lib/action-result';
import {
  createAppointmentAction,
  createScheduleBlockAction,
} from '@/server/actions/agenda-actions';
import { createClientAction } from '@/server/actions/client-actions';
import { formatTimeInTz } from '@/lib/time';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { SerializedProfessional, SerializedService } from '@/lib/serialize';
import type { Client } from '@/generated/prisma/client';

const REASON_SUGGESTIONS = ['Almoço', 'Folga', 'Consulta médica'];

export type QuickCreateDefaults = {
  startAt: Date;
  /** Quando a pessoa arrastou um intervalo: vira a duração do bloqueio. */
  durationMinutes?: number;
  professionalId?: string;
  clientId?: string;
  serviceId?: string;
  /** "Agendar sessão" do pacote. */
  packageId?: string;
};

/**
 * O cartão do Google Agenda ao clicar num horário vazio: cria ali mesmo, sem abrir formulário.
 * Agendamento pede só cliente e serviço (dia, hora e profissional já vêm do clique); "Mais opções"
 * leva ao formulário completo com o que já foi escolhido. A segunda aba bloqueia o horário.
 */
export function QuickCreateCard({
  defaults,
  clients,
  professionals,
  services,
  timezone,
  onClose,
  onMoreOptions,
  onCreated,
}: {
  /** Recebe a mensagem de confirmação do cliente, para quem agendou poder enviá-la. */
  onCreated?: (confirmation: ConfirmationToSend) => void;
  defaults: QuickCreateDefaults;
  clients: Client[];
  professionals: SerializedProfessional[];
  services: SerializedService[];
  timezone: string;
  onClose: () => void;
  onMoreOptions: (defaults: QuickCreateDefaults) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<'appointment' | 'block'>('appointment');
  const [clientId, setClientId] = React.useState('');
  const [serviceId, setServiceId] = React.useState('');
  const [professionalId, setProfessionalId] = React.useState(defaults.professionalId ?? '');
  const [blockMinutes, setBlockMinutes] = React.useState(defaults.durationMinutes ?? 60);
  // Cliente que liga pela primeira vez: cadastra aqui mesmo, junto com o agendamento.
  const [newClient, setNewClient] = React.useState(false);
  const [newClientName, setNewClientName] = React.useState('');
  const [newClientPhone, setNewClientPhone] = React.useState('');
  const [reason, setReason] = React.useState('');
  // O cartão é recriado a cada horário clicado (key), então "já passou" é medido uma vez.
  const [isPast] = React.useState(() => defaults.startAt.getTime() < Date.now());

  const service = services.find((s) => s.id === serviceId);
  const endAt = new Date(
    defaults.startAt.getTime() +
      (tab === 'block' ? blockMinutes : (service?.durationMinutes ?? 30)) * 60_000,
  );
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(defaults.startAt);

  const createAppointment = useMutation({
    mutationFn: async () => {
      let id = clientId;
      if (newClient) {
        const created = unwrapResult(
          await createClientAction({
            name: newClientName.trim(),
            phone: newClientPhone.trim() || undefined,
          }),
        );
        id = created.id;
      }
      return unwrapResult(
        await createAppointmentAction({
          clientId: id,
          serviceId,
          professionalId,
          startAt: defaults.startAt,
        }),
      );
    },
    onSuccess: (result) => {
      toast.success('Agendamento criado.');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onClose();
      if (result.confirmation) onCreated?.(result.confirmation);
    },
    onError: (error: Error) =>
      toast.error(error.message || 'Não foi possível criar o agendamento.'),
  });

  const createBlock = useMutation({
    mutationFn: async () =>
      unwrapResult(
        await createScheduleBlockAction({
          professionalId,
          startAt: defaults.startAt,
          endAt,
          reason: reason.trim() || undefined,
        }),
      ),
    onSuccess: () => {
      toast.success('Horário bloqueado.');
      queryClient.invalidateQueries({ queryKey: ['schedule-context'] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível bloquear o horário.'),
  });

  const clientOptions: ComboboxOption[] = clients.map((c) => ({
    value: c.id,
    label: c.name,
    description: c.phone ?? undefined,
  }));
  const serviceOptions: ComboboxOption[] = services.map((s) => ({
    value: s.id,
    label: s.name,
    description: `${s.durationMinutes} min · ${formatCurrencyBRL(s.price)}`,
  }));
  const professionalOptions: ComboboxOption[] = professionals.map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const canSave =
    tab === 'appointment'
      ? Boolean((newClient ? newClientName.trim() : clientId) && serviceId && professionalId)
      : Boolean(professionalId);
  const saving = createAppointment.isPending || createBlock.isPending;

  return (
    <form
      className="flex flex-col gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        if (tab === 'appointment') createAppointment.mutate();
        else createBlock.mutate();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl
          value={tab}
          onValueChange={setTab}
          options={[
            { value: 'appointment', label: 'Agendamento' },
            { value: 'block', label: 'Bloquear horário' },
          ]}
        />
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar">
          <XIcon className="size-4" />
        </Button>
      </div>

      {tab === 'appointment' && isPast && (
        <p className="rounded-xl bg-[#ff9f0a]/12 px-3 py-2 text-[12px] text-[#8a4b00] dark:text-[#ffb340]">
          Esse horário já passou: o agendamento fica registrado no passado.
        </p>
      )}

      <div className="text-label-secondary flex items-start gap-2 text-[13px]">
        <ClockIcon className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="text-foreground first-letter:uppercase">{dateLabel}</span>
          <br />
          {formatTimeInTz(defaults.startAt, timezone)} – {formatTimeInTz(endAt, timezone)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <UserRoundIcon className="text-label-secondary size-4 shrink-0" />
        <div className="flex-1">
          <Combobox
            options={professionalOptions}
            value={professionalId}
            onChange={setProfessionalId}
            placeholder="Profissional"
            searchPlaceholder="Buscar profissional..."
          />
        </div>
      </div>

      {tab === 'appointment' ? (
        <>
          {newClient ? (
            <div className="flex flex-col gap-2">
              <Input
                autoFocus
                placeholder="Nome do cliente novo"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                maxLength={200}
              />
              <Input
                placeholder="Telefone (opcional)"
                inputMode="tel"
                value={newClientPhone}
                onChange={(e) => setNewClientPhone(e.target.value)}
                maxLength={30}
              />
            </div>
          ) : (
            <Combobox
              options={clientOptions}
              value={clientId}
              onChange={setClientId}
              placeholder="Cliente"
              searchPlaceholder="Buscar cliente..."
            />
          )}
          <button
            type="button"
            onClick={() => setNewClient((v) => !v)}
            className="text-system-blue -mt-1 self-start text-[12px] font-medium hover:underline"
          >
            {newClient ? 'Escolher cliente cadastrado' : '+ Cliente novo'}
          </button>
          <Combobox
            options={serviceOptions}
            value={serviceId}
            onChange={setServiceId}
            placeholder="Serviço"
            searchPlaceholder="Buscar serviço..."
          />
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([30, 60, 90, 120, blockMinutes])]
              .sort((a, b) => a - b)
              .map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setBlockMinutes(minutes)}
                  className={
                    minutes === blockMinutes
                      ? 'bg-foreground text-background rounded-full px-2.5 py-1 text-[12px]'
                      : 'bg-foreground/[0.06] hover:bg-foreground/[0.1] rounded-full px-2.5 py-1 text-[12px]'
                  }
                >
                  {minutes < 60
                    ? `${minutes} min`
                    : `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, '0') : ''}`}
                </button>
              ))}
          </div>
          <Input
            placeholder="Motivo (opcional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
          />
          <div className="flex flex-wrap gap-1.5">
            {REASON_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setReason(suggestion)}
                className="bg-foreground/[0.06] hover:bg-foreground/[0.1] rounded-full px-2.5 py-1 text-[12px]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {tab === 'appointment' && (
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              onMoreOptions({
                startAt: defaults.startAt,
                professionalId: professionalId || undefined,
                clientId: clientId || undefined,
                serviceId: serviceId || undefined,
              })
            }
          >
            Mais opções
          </Button>
        )}
        <Button type="submit" disabled={!canSave || saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}
