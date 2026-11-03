'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BanknoteIcon, QrCodeIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { unwrapResult } from '@/lib/action-result';
import {
  getDepositSettingsAction,
  removeDepositKeyAction,
  saveDepositSettingsAction,
} from '@/server/actions/deposit-actions';

type Mode = 'onsite' | 'online';

const MODES: {
  value: Mode;
  icon: typeof BanknoteIcon;
  title: string;
  text: string;
  note?: string;
}[] = [
  {
    value: 'onsite',
    icon: BanknoteIcon,
    title: 'Receber na hora',
    text: 'O cliente agenda pelo link sem pagar nada agora e paga no atendimento. O horário fica reservado normalmente.',
  },
  {
    value: 'online',
    icon: QrCodeIcon,
    title: 'Receber pelo sistema (PIX pela Asaas)',
    text: 'O cliente paga por PIX ao marcar — uma parte (sinal) ou o valor todo. Cai na sua conta Asaas e reduz faltas.',
    note: 'A Asaas é uma plataforma à parte, com conta sua. Ela cobra R$ 1,99 por PIX recebido.',
  },
];

/**
 * Como o negócio recebe de quem marca pelo link: na hora (no atendimento) ou pelo sistema, com PIX
 * na conta Asaas do próprio negócio (sinal ou valor total; obrigatório ou escolha do cliente).
 */
export function DepositCard() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['deposit-settings'],
    queryFn: () => getDepositSettingsAction(),
  });
  const [modePick, setModePick] = React.useState<Mode | null>(null);
  const [apiKey, setApiKey] = React.useState('');
  const [percent, setPercent] = React.useState<string | null>(null);
  const [hold, setHold] = React.useState<string | null>(null);
  const [requiredPick, setRequiredPick] = React.useState<'required' | 'optional' | null>(null);
  const savedMode: Mode = data && data.percent > 0 ? 'online' : 'onsite';
  const mode = modePick ?? savedMode;
  const requiredValue = requiredPick ?? (data?.required === false ? 'optional' : 'required');
  const percentValue = percent ?? String(data?.percent ?? 0);
  const holdValue = hold ?? String(data?.holdMinutes ?? 30);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['deposit-settings'] });

  const save = useMutation({
    mutationFn: () => {
      const online = mode === 'online';
      const pct = online ? Number(percentValue) || 0 : 0;
      if (online && pct <= 0) {
        throw new Error('Escolha quanto cobrar: 30%, 50% ou valor total.');
      }
      return saveDepositSettingsAction({
        apiKey: online ? apiKey || undefined : undefined,
        percent: pct,
        holdMinutes: Number(holdValue) || 30,
        ...(online ? { required: requiredValue === 'required' } : {}),
      }).then(unwrapResult);
    },
    onSuccess: () => {
      toast.success(
        mode === 'online'
          ? 'Pagamento pelo sistema ligado no link de agendamento.'
          : 'Pronto: o cliente agenda sem pagar agora e paga na hora do atendimento.',
      );
      setApiKey('');
      setModePick(null);
      setPercent(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => removeDepositKeyAction().then(unwrapResult),
    onSuccess: () => {
      toast.success('Conta Asaas desconectada; voltou para "Receber na hora".');
      setPercent(null);
      setModePick(null);
      refresh();
    },
  });

  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">Como você recebe de quem agenda pelo link</h2>
        <p className="text-label-secondary text-[13px]">
          Escolha uma das duas formas. Dá para mudar a qualquer momento: quem já marcou não é
          afetado.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Forma de receber">
        {MODES.map((m) => {
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setModePick(m.value)}
              className={cn(
                'flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors',
                active
                  ? 'border-system-blue bg-system-blue/[0.06]'
                  : 'border-foreground/[0.1] hover:bg-foreground/[0.03]',
              )}
            >
              <m.icon
                className={cn('mt-0.5 size-5 shrink-0', active && 'text-system-blue')}
                aria-hidden
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold">
                  {m.title}
                  {savedMode === m.value && (
                    <span className="text-label-secondary ml-2 text-[11px] font-normal">
                      em uso
                    </span>
                  )}
                </span>
                <span className="text-label-secondary text-[12px] leading-snug">{m.text}</span>
                {m.note && <span className="text-[12px] leading-snug font-medium">{m.note}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {mode === 'online' && (
        <p className="bg-foreground/[0.04] rounded-xl px-4 py-3 text-[13px] leading-snug">
          <span className="font-semibold">Como funciona a cobrança:</span> a Asaas é uma plataforma
          de pagamentos <span className="font-semibold">separada do Atendafy</span>. Você abre e
          mantém uma conta própria lá, e o PIX cai direto nela. A Asaas cobra{' '}
          <span className="font-semibold">R$ 1,99 por PIX recebido</span> — esse valor é dela, não
          do Atendafy, e é cobrado pela Asaas. Para receber sem taxa nenhuma, use &quot;Receber na
          hora&quot;.
        </p>
      )}

      {mode === 'online' && data && (
        <p
          className={`rounded-xl px-4 py-3 text-[13px] ${
            data.connected && data.percent > 0
              ? 'bg-system-green/10'
              : 'bg-[#ff9f0a]/12 text-[#8a4b00] dark:text-[#ffb340]'
          }`}
        >
          {!data.connected ? (
            <>
              <span className="font-semibold">Ainda não aparece para o cliente:</span> falta
              conectar a conta Asaas do seu negócio (é nela que o PIX cai). Cole a chave de API
              abaixo.
            </>
          ) : data.percent <= 0 ? (
            <>
              <span className="font-semibold">Ainda não aparece para o cliente:</span> escolha
              quanto cobrar (30%, 50% ou valor total) e salve.
            </>
          ) : (
            <>
              <span className="font-semibold">Ligado no link de agendamento:</span> cobra{' '}
              {data.percent === 100 ? 'o valor total' : `${data.percent}%`};{' '}
              {data.required
                ? 'o pagamento é obrigatório para reservar.'
                : 'o cliente escolhe pagar agora por PIX ou no atendimento.'}
            </>
          )}
        </p>
      )}

      <form
        className="grid gap-2 sm:grid-cols-[1fr_120px_140px]"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {mode === 'online' && (
          <>
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
                min={1}
                max={100}
                value={percentValue}
                onChange={(e) => setPercent(e.target.value)}
                aria-label="Percentual cobrado"
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
              <span className="text-label-secondary text-[12px]">
                O prazo (em minutos) é quanto o horário fica reservado esperando o PIX.
              </span>
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
                  ? 'Todo mundo que marca pelo link paga para confirmar o horário. Não pago no prazo, o horário é liberado.'
                  : 'O cliente escolhe entre pagar agora por PIX ou pagar no atendimento. Sem pagar agora, o horário fica reservado normalmente.'}
              </span>
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <Button type="submit" variant="outline" disabled={save.isPending}>
            {save.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
          {mode === 'online' && data?.connected && (
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
            {mode === 'online'
              ? 'A chave fica cifrada e é conferida com a Asaas antes de salvar. O valor pago é descontado na hora de cobrar o atendimento.'
              : 'Você pode ligar o pagamento pelo sistema depois, sem perder nada.'}
          </span>
        </div>
      </form>
    </section>
  );
}
