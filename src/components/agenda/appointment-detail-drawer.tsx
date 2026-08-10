'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  updateAppointmentStatusAction,
  cancelAppointmentAction,
} from '@/server/actions/agenda-actions';
import {
  ACTIVE_STATUS_OPTIONS,
  STATUS_BADGE_VARIANT,
  STATUS_LABELS,
} from '@/components/agenda/status';
import { formatCurrencyBRL } from '@/lib/serialize';
import { formatTimeInTz } from '@/lib/time';
import type { SerializedAppointment } from '@/lib/serialize';
import type { AppointmentStatus } from '@/generated/prisma/client';

export function AppointmentDetailDrawer({
  appointment,
  open,
  onOpenChange,
  timezone,
}: {
  appointment: SerializedAppointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const [cancelReason, setCancelReason] = React.useState('');
  const [showCancelForm, setShowCancelForm] = React.useState(false);

  const statusMutation = useMutation({
    mutationFn: (status: Exclude<AppointmentStatus, 'CANCELED'>) =>
      updateAppointmentStatusAction({ id: appointment!.id, status }),
    onSuccess: () => {
      toast.success('Status atualizado.');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar o status.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelAppointmentAction({ id: appointment!.id, reason: cancelReason || undefined }),
    onSuccess: () => {
      toast.success('Agendamento cancelado.');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setShowCancelForm(false);
      setCancelReason('');
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível cancelar.'),
  });

  if (!appointment) return null;

  const isCanceled = appointment.status === 'CANCELED';

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center gap-2">
            <DrawerTitle>{appointment.client.name}</DrawerTitle>
            <Badge variant={STATUS_BADGE_VARIANT[appointment.status]}>
              {STATUS_LABELS[appointment.status]}
            </Badge>
          </div>
          <DrawerDescription>
            {formatTimeInTz(appointment.startAt, timezone)} –{' '}
            {formatTimeInTz(appointment.endAt, timezone)} · {appointment.serviceNameSnapshot}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-muted-foreground text-xs">Profissional</div>
              <div>{appointment.professional.name}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Valor</div>
              <div>{formatCurrencyBRL(appointment.priceSnapshot)}</div>
            </div>
            {appointment.client.phone && (
              <div>
                <div className="text-muted-foreground text-xs">Telefone</div>
                <div>{appointment.client.phone}</div>
              </div>
            )}
          </div>

          {appointment.notes && (
            <div>
              <div className="text-muted-foreground text-xs">Observações</div>
              <div>{appointment.notes}</div>
            </div>
          )}

          {!isCanceled && (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">Status</span>
              <Select
                value={appointment.status}
                disabled={statusMutation.isPending}
                onValueChange={(value: string) =>
                  statusMutation.mutate(value as Exclude<AppointmentStatus, 'CANCELED'>)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVE_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isCanceled && appointment.cancellationReason && (
            <div>
              <div className="text-muted-foreground text-xs">Motivo do cancelamento</div>
              <div>{appointment.cancellationReason}</div>
            </div>
          )}

          {!isCanceled && showCancelForm && (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">Motivo (opcional)</span>
              <Textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: cliente remarcou"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowCancelForm(false)}>
                  Voltar
                </Button>
              </div>
            </div>
          )}
        </div>

        <DrawerFooter>
          {!isCanceled && !showCancelForm && (
            <Button variant="destructive" onClick={() => setShowCancelForm(true)}>
              Cancelar agendamento
            </Button>
          )}
          <DrawerClose asChild>
            <Button variant="outline">Fechar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
