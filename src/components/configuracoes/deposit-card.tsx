'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { unwrapResult } from '@/lib/action-result';
import {
  getDepositSettingsAction,
  removeDepositKeyAction,
  saveDepositSettingsAction,
} from '@/server/actions/deposit-actions';

/** Sinal por PIX no agendamento online, pago na conta Asaas do próprio salão. */
export function DepositCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['deposit-settings'],
    queryFn: () => getDepositSettingsAction(),
  });
  const [apiKey, setApiKey] = React.useState('');
  const [percent, setPercent] = React.useState<string | null>(null);
  const [hold, setHold] = React.useState<string | null>(null);
  const [requiredPick, setRequiredPick] = React.useState<'required' | 'optional' | null>(null);
  const requiredValue = requiredPick ?? (data?.required === false ? 'optional' : 'required');
  const percentValue = percent ?? String(data?.percent ?? 0);
  const holdValue = hold ?? String(data?.holdMinutes ?? 30);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['deposit-settings'] });

  const save = useMutation({
    mutationFn: () =>
      saveDepositSettingsAction({
        apiKey: apiKey || undefined,
        percent: Number(percentValue) || 0,
        holdMinutes: Number(holdValue) || 30,
        required: requiredValue === 'required',
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success(
        Number(percentValue) > 0
          ? 'Sinal por PIX ligado no agendamento online.'
          : 'Configuração salva.',
      );
      setApiKey('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => removeDepositKeyAction().then(unwrapResult),
    onSuccess: () => {
      toast.success('Conta Asaas desconectada; o sinal foi desligado.');
      setPercent(null);
      refresh();
    },
  });

  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">
          Pagamento adiantado por PIX no agendamento online
        </h2>
        <p className="text-label-secondary text-[13px]">
          Quem marca pelo link já paga por PIX — uma parte (sinal) ou o valor todo (100%) — e isso é
          o maior redutor de faltas. O dinheiro cai na sua conta Asaas; o horário fica reservado
          pelo prazo abaixo e é liberado se não for pago. O valor pago é descontado na hora de
          cobrar o atendimento.
        </p>
      </div>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_120px_140px]"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Input
          type="password"
          autoComplete="off"
          placeholder={
            data?.connected
              ? `Chave salva (${data.environment === 'sandbox' ? 'sandbox' : 'produção'}) — deixe vazio para manter`
              : 'Chave de API da sua conta Asaas ($aact_...)'
          }
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          aria-label="Chave de API da Asaas"
        />
        <label className="flex items-center gap-2 text-[13px]">
          <Input
            type="number"
            min={0}
            max={100}
            value={percentValue}
            onChange={(e) => setPercent(e.target.value)}
            aria-label="Percentual do sinal"
          />
          %
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <Input
            type="number"
            min={10}
            max={1440}
            value={holdValue}
            onChange={(e) => setHold(e.target.value)}
            aria-label="Prazo para pagar"
          />
          min
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <span className="text-[13px] font-medium">Cobrar:</span>
          {[30, 50, 100].map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={Number(percentValue) === p ? 'default' : 'outline'}
              onClick={() => setPercent(String(p))}
            >
              {p === 100 ? 'Valor total' : `${p}%`}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-3">
          <span className="text-[13px] font-medium">No link de agendamento</span>
          <SegmentedControl
            size="sm"
            className="self-start"
            value={requiredValue}
            onValueChange={(v: string) => setRequiredPick(v as 'required' | 'optional')}
            options={[
              { value: 'required', label: 'Pagamento obrigatório' },
              { value: 'optional', label: 'Cliente escolhe pagar agora' },
            ]}
          />
          <span className="text-label-secondary text-[12px]">
            {requiredValue === 'required'
              ? 'Todo mundo que marca pelo link paga para confirmar o horário.'
              : 'O cliente escolhe entre pagar agora por PIX ou pagar no atendimento. Sem pagar agora, o horário fica reservado normalmente.'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <Button type="submit" variant="outline" disabled={save.isPending}>
            {save.isPending ? 'Conferindo a chave...' : 'Salvar'}
          </Button>
          {data?.connected && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => remove.mutate()}
            >
              Desconectar Asaas
            </Button>
          )}
          <span className="text-label-secondary text-[12px]">
            0% desliga o sinal. A chave fica cifrada e é conferida com a Asaas antes de salvar.
          </span>
        </div>
      </form>
    </section>
  );
}
