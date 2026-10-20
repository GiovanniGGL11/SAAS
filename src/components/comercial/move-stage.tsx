'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { moveOpportunityAction } from '@/server/actions/crm-actions';

type Stage = { id: string; name: string; kind: string };

/** Pede o motivo quando a etapa de destino é de perda; o servidor confere tudo de novo. */
export function useMoveOpportunity(onMoved: () => void) {
  const [pendingLost, setPendingLost] = React.useState<{
    id: string;
    from: string;
    to: string;
  } | null>(null);
  const [reason, setReason] = React.useState('');
  const move = useMutation({
    mutationFn: (input: {
      id: string;
      fromStageId: string;
      toStageId: string;
      lostReason?: string;
    }) => moveOpportunityAction(input).then(unwrapResult),
    onSuccess: (r) => {
      if (r.moved)
        toast.success(
          r.status === 'WON'
            ? 'Oportunidade ganha!'
            : r.status === 'LOST'
              ? 'Marcada como perdida.'
              : 'Etapa atualizada.',
        );
      setPendingLost(null);
      setReason('');
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
    onSettled: onMoved,
  });
  const request = (id: string, from: string, to: Stage) => {
    if (to.kind === 'LOST') setPendingLost({ id, from, to: to.id });
    else move.mutate({ id, fromStageId: from, toStageId: to.id });
  };
  const dialog = (
    <Dialog open={!!pendingLost} onOpenChange={(o: boolean) => !o && setPendingLost(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Por que foi perdida?</DialogTitle>
          <DialogDescription>
            O motivo fica no histórico e ajuda a entender o funil.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (pendingLost && reason.trim())
              move.mutate({
                id: pendingLost.id,
                fromStageId: pendingLost.from,
                toStageId: pendingLost.to,
                lostReason: reason,
              });
          }}
        >
          <Input
            autoFocus
            maxLength={300}
            placeholder="Ex.: preço, escolheu outro, sem retorno"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Motivo da perda"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={!reason.trim() || move.isPending}>
              Marcar como perdida
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPendingLost(null)}>
              Voltar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
  return { request, dialog, pending: move.isPending };
}

/** Seletor "Mover para…" (acessível por teclado e no celular). */
export function MoveStageControl({
  opportunityId,
  currentStageId,
  stages,
  onMoved,
}: {
  opportunityId: string;
  currentStageId: string;
  stages: Stage[];
  onMoved: () => void;
}) {
  const { request, dialog, pending } = useMoveOpportunity(onMoved);
  return (
    <label className="flex flex-col gap-1 text-[12px]">
      <span className="text-label-secondary">Etapa</span>
      <Select
        value={currentStageId}
        disabled={pending}
        onValueChange={(v: string) => {
          const to = stages.find((s) => s.id === v);
          if (to) request(opportunityId, currentStageId, to);
        }}
      >
        <SelectTrigger className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {stages.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {dialog}
    </label>
  );
}
