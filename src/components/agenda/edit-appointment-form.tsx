'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { updateAppointmentDetailsAction } from '@/server/actions/agenda-actions';
import type { SerializedAppointment, SerializedService } from '@/lib/serialize';
import type { Client } from '@/generated/prisma/client';

/** Trocar cliente, serviço ou observação sem cancelar e refazer o agendamento. */
export function EditAppointmentForm({
  appointment,
  clients,
  services,
  onDone,
}: {
  appointment: SerializedAppointment;
  clients: Client[];
  services: SerializedService[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = React.useState(appointment.clientId);
  const [serviceId, setServiceId] = React.useState(appointment.serviceId);
  const [notes, setNotes] = React.useState(appointment.notes ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      updateAppointmentDetailsAction({
        id: appointment.id,
        clientId: clientId !== appointment.clientId ? clientId : undefined,
        serviceId: serviceId !== appointment.serviceId ? serviceId : undefined,
        notes: notes.trim() || null,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Agendamento atualizado.');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onDone();
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  return (
    <div className="ring-foreground/[0.08] flex flex-col gap-3 rounded-xl p-3 ring-1">
      <span className="text-[13px] font-semibold">Editar agendamento</span>
      <Combobox
        options={clients.map((c) => ({
          value: c.id,
          label: c.name,
          description: c.phone ?? undefined,
        }))}
        value={clientId}
        onChange={setClientId}
        placeholder="Cliente"
        searchPlaceholder="Buscar cliente..."
      />
      <Combobox
        options={services.map((s) => ({
          value: s.id,
          label: s.name,
          description: `${s.durationMinutes} min · ${formatCurrencyBRL(s.price)}`,
        }))}
        value={serviceId}
        onChange={setServiceId}
        placeholder="Serviço"
        searchPlaceholder="Buscar serviço..."
      />
      {serviceId !== appointment.serviceId && (
        <p className="text-label-secondary text-xs">
          A duração e o preço passam a ser os do novo serviço.
        </p>
      )}
      <Textarea
        rows={2}
        placeholder="Observações"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Voltar
        </Button>
        <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  );
}
