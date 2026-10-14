'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLineIcon, ArrowUpFromLineIcon, LockIcon, VaultIcon } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader, Surface } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/dashboard/stat-tile';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { PAYMENT_METHODS } from '@/lib/validations/finance';
import { cn } from '@/lib/utils';
import {
  addCashMovementAction,
  closeCashSessionAction,
  getCashRegisterAction,
  openCashSessionAction,
} from '@/server/actions/cash-register-actions';

type Register = Awaited<ReturnType<typeof getCashRegisterAction>>;
type Session = NonNullable<Register['current']>;

function parseMoney(value: string): number {
  const n = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

const methodLabel = (value: string | null) =>
  value ? (PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value) : 'Sem forma definida';

export function CashRegisterView({ timezone }: { timezone: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['cash-register'],
    queryFn: () => getCashRegisterAction(),
    // Comandas fechadas na agenda entram no esperado sem precisar recarregar.
    refetchInterval: 30_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['cash-register'] });
  const time = (d: Date | string) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(d));
  const dateTime = (d: Date | string) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(d));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Caixa"
        description="Abra com o troco, registre sangrias e suprimentos e confira a gaveta no fechamento."
      />
      {!data ? (
        <Skeleton className="h-64 rounded-[22px]" />
      ) : data.current ? (
        <OpenSession session={data.current} time={time} onChange={refresh} />
      ) : (
        <OpenForm onOpened={refresh} />
      )}

      {data && data.recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-[17px] font-semibold">Fechamentos anteriores</h2>
          <Surface>
            <ul className="divide-foreground/[0.06] divide-y text-[14px]">
              {data.recent.map((s) => {
                const diff = Math.round(((s.countedCash ?? 0) - s.expectedCash) * 100) / 100;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3">
                    <span className="min-w-40 font-medium">
                      {dateTime(s.openedAt)} → {time(s.closedAt!)}
                    </span>
                    <span className="text-label-secondary">
                      Esperado {formatCurrencyBRL(s.expectedCash)}
                    </span>
                    <span className="text-label-secondary">
                      Contado {formatCurrencyBRL(s.countedCash ?? 0)}
                    </span>
                    <DiffBadge diff={diff} />
                    {s.notes && (
                      <span className="text-label-secondary w-full text-[13px]">“{s.notes}”</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Surface>
        </div>
      )}
    </div>
  );
}

function DiffBadge({ diff }: { diff: number }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-[12px] font-semibold',
        diff === 0 && 'bg-system-green/15 text-delta-good',
        diff > 0 && 'bg-system-blue/15 text-system-blue',
        diff < 0 && 'bg-system-red/12 text-destructive',
      )}
    >
      {diff === 0
        ? 'Bateu'
        : diff > 0
          ? `Sobrou ${formatCurrencyBRL(diff)}`
          : `Faltou ${formatCurrencyBRL(-diff)}`}
    </span>
  );
}

function OpenForm({ onOpened }: { onOpened: () => void }) {
  const [amount, setAmount] = React.useState('');
  const open = useMutation({
    mutationFn: () => {
      const value = parseMoney(amount || '0');
      if (Number.isNaN(value)) throw new Error('Informe o troco em reais.');
      return openCashSessionAction({ openingAmount: value }).then(unwrapResult);
    },
    onSuccess: () => {
      toast.success('Caixa aberto.');
      onOpened();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <section className="bg-tile flex flex-col items-start gap-4 rounded-[22px] p-6">
      <span className="bg-system-blue/12 text-system-blue flex size-11 items-center justify-center rounded-full">
        <VaultIcon className="size-5" />
      </span>
      <div>
        <h2 className="text-[20px] font-semibold">O caixa está fechado</h2>
        <p className="text-label-secondary text-[14px]">
          Conte o troco que está na gaveta e abra o caixa do dia.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          open.mutate();
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Troco inicial (R$)</span>
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-40"
          />
        </label>
        <Button type="submit" disabled={open.isPending}>
          Abrir caixa
        </Button>
      </form>
    </section>
  );
}

function OpenSession({
  session,
  time,
  onChange,
}: {
  session: Session;
  time: (d: Date | string) => string;
  onChange: () => void;
}) {
  const [movement, setMovement] = React.useState<'WITHDRAWAL' | 'DEPOSIT' | null>(null);
  const [closing, setClosing] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-label-secondary flex items-center gap-2 text-[14px]">
        <span className="bg-system-green size-2 rounded-full" />
        Aberto às {time(session.openedAt)} com {formatCurrencyBRL(session.openingAmount)} de troco
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatTile
          index={0}
          label="Dinheiro recebido"
          value={formatCurrencyBRL(session.cashIncome)}
          iconColor="var(--system-green)"
          icon={ArrowDownToLineIcon}
        />
        <StatTile
          index={1}
          label="Pago em dinheiro"
          value={formatCurrencyBRL(session.cashExpense)}
          iconColor="var(--system-red)"
          icon={ArrowUpFromLineIcon}
        />
        <StatTile
          index={2}
          label="Sangria / suprimento"
          value={formatCurrencyBRL(session.deposits - session.withdrawals)}
          hint={`${formatCurrencyBRL(session.withdrawals)} retirado · ${formatCurrencyBRL(session.deposits)} colocado`}
          icon={VaultIcon}
          iconColor="#ff9500"
        />
        <StatTile
          index={3}
          label="Esperado na gaveta"
          value={formatCurrencyBRL(session.expectedCash)}
          icon={LockIcon}
          iconColor="var(--system-blue)"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setMovement('WITHDRAWAL')}>
          <ArrowUpFromLineIcon className="size-4" />
          Sangria
        </Button>
        <Button variant="outline" onClick={() => setMovement('DEPOSIT')}>
          <ArrowDownToLineIcon className="size-4" />
          Suprimento
        </Button>
        <Button onClick={() => setClosing(true)}>
          <LockIcon className="size-4" />
          Fechar caixa
        </Button>
      </div>

      {movement && (
        <MovementForm
          sessionId={session.id}
          kind={movement}
          onDone={() => {
            setMovement(null);
            onChange();
          }}
          onCancel={() => setMovement(null)}
        />
      )}
      {closing && (
        <CloseForm
          session={session}
          onDone={() => {
            setClosing(false);
            onChange();
          }}
          onCancel={() => setClosing(false)}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="p-5">
          <h3 className="mb-3 text-[15px] font-semibold">Recebido no caixa, por forma</h3>
          {session.byMethod.length === 0 ? (
            <p className="text-label-secondary text-[14px]">Nada recebido ainda neste caixa.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-[14px]">
              {session.byMethod
                .slice()
                .sort((a, b) => b.income - a.income)
                .map((m) => (
                  <li key={m.paymentMethod ?? 'none'} className="flex justify-between gap-4">
                    <span>{methodLabel(m.paymentMethod)}</span>
                    <span className="tabular-nums">
                      {formatCurrencyBRL(m.income)}
                      {m.expense > 0 && (
                        <span className="text-label-secondary">
                          {' '}
                          · −{formatCurrencyBRL(m.expense)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
          )}
          <p className="text-label-secondary mt-3 text-[12px]">
            Confira cartão e PIX com a maquininha e o extrato.
          </p>
        </Surface>
        <Surface className="p-5">
          <h3 className="mb-3 text-[15px] font-semibold">Sangrias e suprimentos</h3>
          {session.movements.length === 0 ? (
            <p className="text-label-secondary text-[14px]">Nenhuma movimentação.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-[14px]">
              {session.movements.map((m) => (
                <li key={m.id} className="flex justify-between gap-4">
                  <span>
                    <span className="text-label-secondary tabular-nums">{time(m.createdAt)}</span>{' '}
                    {m.kind === 'WITHDRAWAL' ? 'Sangria' : 'Suprimento'}
                    {m.reason ? ` · ${m.reason}` : ''}
                  </span>
                  <span
                    className={cn(
                      'tabular-nums',
                      m.kind === 'WITHDRAWAL' ? 'text-destructive' : 'text-delta-good',
                    )}
                  >
                    {m.kind === 'WITHDRAWAL' ? '−' : '+'}
                    {formatCurrencyBRL(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>
    </div>
  );
}

function MovementForm({
  sessionId,
  kind,
  onDone,
  onCancel,
}: {
  sessionId: string;
  kind: 'WITHDRAWAL' | 'DEPOSIT';
  onDone: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const save = useMutation({
    mutationFn: () => {
      const value = parseMoney(amount);
      if (!value) throw new Error('Informe o valor.');
      return addCashMovementAction({
        sessionId,
        kind,
        amount: value,
        reason: reason || undefined,
      }).then(unwrapResult);
    },
    onSuccess: () => {
      toast.success(kind === 'WITHDRAWAL' ? 'Sangria registrada.' : 'Suprimento registrado.');
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <form
      className="bg-tile flex flex-wrap items-end gap-3 rounded-[18px] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{kind === 'WITHDRAWAL' ? 'Sangria' : 'Suprimento'} (R$)</span>
        <Input
          autoFocus
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-36"
        />
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm">
        <span className="font-medium">Motivo (opcional)</span>
        <Input
          placeholder={kind === 'WITHDRAWAL' ? 'Ex: depósito no banco' : 'Ex: troco extra'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
        />
      </label>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Voltar
      </Button>
      <Button type="submit" disabled={save.isPending}>
        Registrar
      </Button>
    </form>
  );
}

function CloseForm({
  session,
  onDone,
  onCancel,
}: {
  session: Session;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [counted, setCounted] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const value = parseMoney(counted);
  const diff =
    Number.isNaN(value) || counted === ''
      ? null
      : Math.round((value - session.expectedCash) * 100) / 100;
  const close = useMutation({
    mutationFn: () => {
      if (diff === null) throw new Error('Informe quanto tem na gaveta.');
      return closeCashSessionAction({
        sessionId: session.id,
        countedCash: value,
        notes: notes || undefined,
      }).then(unwrapResult);
    },
    onSuccess: () => {
      toast.success('Caixa fechado.');
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <form
      className="bg-tile flex flex-col gap-3 rounded-[18px] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        close.mutate();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Dinheiro contado na gaveta (R$)</span>
          <Input
            autoFocus
            inputMode="decimal"
            placeholder="0,00"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="w-44"
          />
        </label>
        <span className="text-label-secondary pb-2.5 text-[14px]">
          Esperado {formatCurrencyBRL(session.expectedCash)}
        </span>
        {diff !== null && (
          <span className="pb-2">
            <DiffBadge diff={diff} />
          </span>
        )}
      </div>
      {diff !== null && diff !== 0 && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">O que aconteceu? (opcional)</span>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Ex: troco dado errado"
          />
        </label>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Voltar
        </Button>
        <Button type="submit" disabled={close.isPending || diff === null}>
          Fechar caixa
        </Button>
      </div>
    </form>
  );
}
