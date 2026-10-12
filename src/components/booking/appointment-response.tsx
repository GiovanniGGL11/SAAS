'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { unwrapResult } from '@/lib/action-result';
import { respondToAppointmentAction } from '@/server/actions/public-booking-actions';

export function AppointmentResponse({ token, status }: { token: string; status: string }) {
  const router = useRouter();
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const mutation = useMutation({
    mutationFn: (decision: 'confirm' | 'cancel') =>
      respondToAppointmentAction({ token, decision }).then(unwrapResult),
    onSuccess: () => router.refresh(),
  });

  return (
    <div className="flex flex-col gap-2">
      {mutation.error && (
        <p className="text-destructive text-sm">{(mutation.error as Error).message}</p>
      )}
      {status === 'SCHEDULED' && !confirmCancel && (
        <Button
          className="h-11"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate('confirm')}
        >
          Confirmar presença
        </Button>
      )}
      {confirmCancel ? (
        <div className="flex flex-col gap-2">
          <span className="text-[13px]">Cancelar este horário?</span>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('cancel')}
            >
              Sim, cancelar
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmCancel(false)}>
              Voltar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" className="text-destructive" onClick={() => setConfirmCancel(true)}>
          Não vou poder ir
        </Button>
      )}
    </div>
  );
}
