'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2Icon } from 'lucide-react';

import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { setOptOutByTokenAction } from '@/server/actions/marketing-actions';

export function OptOutForm({
  token,
  initialOptedOut,
}: {
  token: string;
  initialOptedOut: boolean;
}) {
  const [optedOut, setOptedOut] = React.useState(initialOptedOut);
  const save = useMutation({
    mutationFn: (next: boolean) =>
      setOptOutByTokenAction({ token, optedOut: next }).then(unwrapResult),
    onSuccess: (r) => setOptedOut(r.optedOut),
  });

  return (
    <div className="flex flex-col gap-3">
      {optedOut ? (
        <p className="bg-system-green/10 flex items-center gap-2 rounded-xl p-3 text-[15px]">
          <CheckCircle2Icon className="text-system-green size-5 shrink-0" />
          Pronto: você não vai mais receber promoções.
        </p>
      ) : (
        <p className="text-[15px]">Você recebe promoções e novidades por mensagem.</p>
      )}
      <Button
        variant={optedOut ? 'outline' : 'default'}
        disabled={save.isPending}
        onClick={() => save.mutate(!optedOut)}
      >
        {optedOut ? 'Quero voltar a receber promoções' : 'Não quero mais receber promoções'}
      </Button>
      {save.isError && (
        <p className="text-destructive text-[13px]">
          {(save.error as Error).message || 'Não foi possível salvar. Tente de novo.'}
        </p>
      )}
    </div>
  );
}
