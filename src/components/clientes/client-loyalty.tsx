'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GiftIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Surface } from '@/components/layout/page';
import { LoyaltyCard } from '@/components/fidelidade/loyalty-card';
import {
  addLoyaltyManuallyAction,
  getClientLoyaltyAction,
  redeemLoyaltyAction,
} from '@/server/actions/loyalty-actions';
import { describeReward, formatLoyaltyAmount, rewardThreshold } from '@/lib/loyalty';

type DialogMode = 'redeem' | 'adjust' | null;

export function ClientLoyalty({
  clientId,
  clientName,
  timezone,
}: {
  clientId: string;
  clientName: string;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = React.useState<DialogMode>(null);
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');

  const { data } = useQuery({
    queryKey: ['client-loyalty', clientId],
    queryFn: () => getClientLoyaltyAction(clientId),
  });

  function onDone(message: string) {
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: ['client-loyalty', clientId] });
    queryClient.invalidateQueries({ queryKey: ['loyalty-overview'] });
    setDialog(null);
  }

  const redeem = useMutation({
    mutationFn: (cashbackAmount?: number) =>
      redeemLoyaltyAction({ clientId, amount: cashbackAmount }),
    onSuccess: () => onDone('Resgate registrado.'),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível resgatar.'),
  });

  const adjust = useMutation({
    mutationFn: () =>
      addLoyaltyManuallyAction({ clientId, amount, description: note || undefined }),
    onSuccess: () => onDone('Lançamento registrado.'),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível lançar.'),
  });

  if (!data) return null;
  const { program, balance, entries } = data;

  if (!program) {
    return (
      <Surface className="flex flex-wrap items-center justify-between gap-3 p-5 md:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-[#ff9f0a]/12 text-[#ff9f0a]">
            <GiftIcon className="size-5" />
          </span>
          <div>
            <div className="text-[15px] font-semibold">Programa de fidelidade</div>
            <div className="text-label-secondary text-[13px]">
              Configure selos, pontos ou cashback para recompensar quem volta.
            </div>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href="/fidelidade">Configurar</Link>
        </Button>
      </Surface>
    );
  }

  const threshold = rewardThreshold(program);
  const canRedeem = program.active && (threshold === null ? balance > 0 : balance >= threshold);
  const isCashback = program.mode === 'CASHBACK';

  function openDialog(mode: Exclude<DialogMode, null>) {
    setAmount(mode === 'redeem' && isCashback ? String(balance) : '');
    setNote('');
    setDialog(mode);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <LoyaltyCard rules={program} balance={balance} holder={clientName} />
        {program.active ? (
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!canRedeem} onClick={() => openDialog('redeem')}>
              <GiftIcon className="size-4" />
              {isCashback ? 'Usar saldo' : 'Resgatar recompensa'}
            </Button>
            <Button variant="outline" onClick={() => openDialog('adjust')} aria-label="Lançar manualmente">
              <PlusIcon className="size-4" />
              Lançar
            </Button>
          </div>
        ) : (
          <p className="text-label-secondary px-1 text-[13px]">
            Programa pausado — reative em{' '}
            <Link href="/fidelidade" className="text-primary underline-offset-2 hover:underline">
              Fidelidade
            </Link>
            .
          </p>
        )}
      </div>

      <Surface className="p-5 md:p-6">
        <div className="mb-3 text-[15px] font-semibold">Extrato de fidelidade</div>
        {entries.length === 0 ? (
          <p className="text-label-secondary text-[13px]">
            Nenhum lançamento ainda. Cada atendimento concluído na Agenda soma aqui automaticamente.
          </p>
        ) : (
          <ul className="divide-foreground/[0.06] divide-y">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[14px]">
                    {entry.kind === 'REDEEM' ? `Resgate · ${entry.description}` : entry.description}
                  </div>
                  <div className="text-label-secondary text-[12px]">
                    {new Intl.DateTimeFormat('pt-BR', {
                      timeZone: timezone,
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    }).format(new Date(entry.createdAt))}
                  </div>
                </div>
                <span
                  className={
                    entry.kind === 'EARN'
                      ? 'text-delta-good shrink-0 text-[14px] font-semibold tabular-nums'
                      : 'text-label-secondary shrink-0 text-[14px] font-semibold tabular-nums'
                  }
                >
                  {entry.kind === 'EARN' ? '+' : '−'}
                  {formatLoyaltyAmount(program.mode, entry.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <Dialog open={dialog !== null} onOpenChange={(open: boolean) => !open && setDialog(null)}>
        <DialogContent>
          {dialog === 'redeem' && (
            <>
              <DialogHeader>
                <DialogTitle>{isCashback ? 'Usar saldo de cashback' : 'Resgatar recompensa'}</DialogTitle>
                <DialogDescription>
                  {isCashback
                    ? `${clientName} tem ${formatLoyaltyAmount(program.mode, balance)} disponíveis.`
                    : `${describeReward(program)} para ${clientName}. Isso desconta ${formatLoyaltyAmount(program.mode, threshold ?? 0)} do saldo.`}
                </DialogDescription>
              </DialogHeader>
              {isCashback && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="redeem-amount">Valor a usar (R$)</Label>
                  <Input
                    id="redeem-amount"
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    max={balance}
                    step={0.01}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Cancelar
                </Button>
                <Button
                  disabled={redeem.isPending}
                  onClick={() => redeem.mutate(isCashback ? Number(amount) : undefined)}
                >
                  {redeem.isPending ? 'Registrando…' : 'Confirmar resgate'}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog === 'adjust' && (
            <>
              <DialogHeader>
                <DialogTitle>Lançar manualmente</DialogTitle>
                <DialogDescription>
                  Útil para trazer o saldo de um cartão de papel antigo ou corrigir um lançamento.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adjust-amount">
                    {isCashback ? 'Valor (R$)' : program.mode === 'STAMPS' ? 'Selos' : 'Pontos'}
                  </Label>
                  <Input
                    id="adjust-amount"
                    type="number"
                    inputMode="decimal"
                    min={isCashback ? 0.01 : 1}
                    step={isCashback ? 0.01 : 1}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adjust-note">Motivo (opcional)</Label>
                  <Input
                    id="adjust-note"
                    placeholder="Ex: saldo do cartão de papel"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Cancelar
                </Button>
                <Button disabled={adjust.isPending || !amount} onClick={() => adjust.mutate()}>
                  {adjust.isPending ? 'Registrando…' : 'Lançar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
