'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ClockIcon,
  MoreHorizontalIcon,
  PhoneIcon,
  ScissorsIcon,
  SparklesIcon,
  StickyNoteIcon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { STATUS_COLORS, STATUS_LABELS, quickStatusActions } from '@/components/agenda/status';
import type { GridAppointment } from '@/components/agenda/calendar-grid';
import { unwrapResult } from '@/lib/action-result';
import {
  cancelAppointmentAction,
  updateAppointmentStatusAction,
} from '@/server/actions/agenda-actions';
import { formatTimeInTz } from '@/lib/time';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { AppointmentStatus } from '@/generated/prisma/client';

/**
 * O cartão do Google Agenda ao clicar num evento: o essencial e as ações, sem tirar a pessoa da
 * agenda. Produtos, cancelamento e histórico ficam em "Mais detalhes" (o painel lateral).
 */
export function AppointmentCard({
  appointment,
  timezone,
  color,
  onClose,
  onOpenDetails,
}: {
  appointment: GridAppointment;
  timezone: string;
  color: string;
  onClose: () => void;
  onOpenDetails: () => void;
}) {
  const queryClient = useQueryClient();
  const statusMutation = useMutation({
    mutationFn: (status: Exclude<AppointmentStatus, 'CANCELED'>) =>
      updateAppointmentStatusAction({ id: appointment.id, status }).then(unwrapResult),
    onSuccess: (_data, status) => {
      toast.success(`Status: ${STATUS_LABELS[status]}.`);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar o status.'),
  });

  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelAppointmentAction({
        id: appointment.id,
        reason: cancelReason.trim() || undefined,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Agendamento cancelado.');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível cancelar.'),
  });

  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(appointment.startAt);
  const actions = appointment.status === 'CANCELED' ? [] : quickStatusActions(appointment.status);

  return (
    <div className="flex flex-col">
      <div className="flex justify-end gap-1 px-2 pt-2">
        <Button variant="ghost" size="icon-sm" onClick={onOpenDetails} aria-label="Mais detalhes">
          <MoreHorizontalIcon className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar">
          <XIcon className="size-4" />
        </Button>
      </div>

      <div className="flex flex-col gap-3 px-5 pb-4 text-[13px]">
        <div className="flex items-start gap-3">
          <span
            className="mt-1.5 size-3.5 shrink-0 rounded-[4px]"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[19px] leading-tight font-semibold">
              <span className="truncate">{appointment.client.name}</span>
              {appointment.isFirstVisit && (
                <SparklesIcon
                  className="text-system-indigo size-4 shrink-0"
                  aria-label="Cliente novo"
                />
              )}
            </div>
            <div className="text-label-secondary mt-0.5 first-letter:uppercase">
              {dateLabel} · {formatTimeInTz(appointment.startAt, timezone)} –{' '}
              {formatTimeInTz(appointment.endAt, timezone)}
            </div>
          </div>
        </div>

        <Row icon={<ScissorsIcon className="size-4" />}>
          {appointment.serviceNameSnapshot} · {formatCurrencyBRL(appointment.priceSnapshot)}
        </Row>
        <Row icon={<UserRoundIcon className="size-4" />}>
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: appointment.professional.color }}
            />
            {appointment.professional.name}
          </span>
        </Row>
        {appointment.client.phone && (
          <Row icon={<PhoneIcon className="size-4" />}>
            <a href={`tel:${appointment.client.phone}`} className="hover:underline">
              {appointment.client.phone}
            </a>
          </Row>
        )}
        {appointment.notes && (
          <Row icon={<StickyNoteIcon className="size-4" />}>{appointment.notes}</Row>
        )}
        <Row icon={<ClockIcon className="size-4" />}>
          <span className="flex items-center gap-1.5 font-medium">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[appointment.status] }}
            />
            {STATUS_LABELS[appointment.status]}
          </span>
        </Row>

        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {actions.map((action) => (
              <Button
                key={action.status}
                size="sm"
                variant={action.primary ? 'default' : 'outline'}
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate(action.status)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
        {confirmCancel ? (
          <div className="bg-destructive/[0.06] flex flex-col gap-2 rounded-xl p-3">
            <span className="text-[13px] font-medium">Cancelar este agendamento?</span>
            <Input
              autoFocus
              placeholder="Motivo (opcional)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={500}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar agendamento'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)}>
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onOpenDetails}
              className="text-system-blue text-[13px] font-medium hover:underline"
            >
              Mais detalhes e produtos
            </button>
            {appointment.status !== 'CANCELED' && appointment.status !== 'DONE' && (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="text-destructive text-[13px] font-medium hover:underline"
              >
                Cancelar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-label-secondary mt-px shrink-0">{icon}</span>
      <div className="min-w-0 flex-1 break-words">{children}</div>
    </div>
  );
}
