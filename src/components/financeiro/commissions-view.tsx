'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon, HandCoinsIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/layout/page';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { monthLabel, shiftMonth } from '@/lib/month';
import { PAYMENT_METHODS } from '@/lib/validations/finance';
import { cn } from '@/lib/utils';
import {
  closeCommissionAction,
  createAdvanceAction,
  deleteAdvanceAction,
  getCommissionOverviewAction,
  reopenCommissionAction,
} from '@/server/actions/commission-actions';

type Line = Awaited<ReturnType<typeof getCommissionOverviewAction>>[number];
type Method = (typeof PAYMENT_METHODS)[number]['value'];

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseMoney(value: string): number {
  const n = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Fechamento de comissão do mês por profissional, com vales descontados. */
export function CommissionsView() {
  const queryClient = useQueryClient();
  const [month, setMonth] = React.useState(thisMonth);
  const [closing, setClosing] = React.useState<Line | null>(null);
  const [advanceFor, setAdvanceFor] = React.useState<string | null>(null);
  const [reopening, setReopening] = React.useState<Line | null>(null);
  const { data } = useQuery({
    queryKey: ['commissions', month],
    queryFn: () => getCommissionOverviewAction({ month }),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['commissions'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
  };

  const removeAdvance = useMutation({
    mutationFn: (id: string) => deleteAdvanceAction(id).then(unwrapResult),
    onSuccess: () => {
      toast.success('Vale removido; a saída do caixa foi cancelada.');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reopen = useMutation({
    mutationFn: (id: string) => reopenCommissionAction(id).then(unwrapResult),
    onSuccess: () => {
      toast.success('Fechamento desfeito. O pagamento foi cancelado e os vales voltaram.');
      setReopening(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = (data ?? []).reduce(
    (acc, l) => ({
      commission: acc.commission + (l.commission ?? 0),
      advances: acc.advances + l.openAdvances,
    }),
    { commission: 0, advances: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mês anterior"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="min-w-40 text-center text-[17px] font-semibold">
            {monthLabel(month)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próximo mês"
            disabled={month >= thisMonth()}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <Button variant="outline" onClick={() => setAdvanceFor('')}>
          <HandCoinsIcon className="size-4" />
          Lançar vale
        </Button>
      </div>

      {!data ? (
        <Skeleton className="h-64 rounded-[22px]" />
      ) : data.length === 0 ? (
        <Surface>
          <EmptyState
            icon={HandCoinsIcon}
            title="Nenhum profissional ativo"
            description="Cadastre a equipe em Profissionais."
          />
        </Surface>
      ) : (
        <Surface className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead>
              <tr className="text-label-secondary border-foreground/[0.06] border-b text-left text-[12px]">
                <th className="px-5 py-3 font-medium">Profissional</th>
                <th className="px-3 py-3 text-right font-medium">Atend.</th>
                <th className="px-3 py-3 text-right font-medium">Cobrado</th>
                <th className="px-3 py-3 text-right font-medium">Comissão</th>
                <th className="px-3 py-3 text-right font-medium">Vales</th>
                <th className="px-3 py-3 text-right font-medium">A pagar</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((line) => {
                const toPay =
                  line.commission === null
                    ? null
                    : Math.round((line.commission - line.openAdvances) * 100) / 100;
                return (
                  <tr
                    key={line.professionalId}
                    className="border-foreground/[0.06] border-b align-top last:border-0"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 font-medium">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: line.color }}
                        />
                        {line.name}
                      </div>
                      <div className="text-label-secondary mt-0.5 text-[12px]">
                        {line.rule ?? 'Sem regra de comissão'}
                      </div>
                      {line.advances.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1">
                          {line.advances.map((a) => (
                            <li
                              key={a.id}
                              className="bg-foreground/[0.05] inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-[11px]"
                              title={a.description ?? undefined}
                            >
                              Vale {formatCurrencyBRL(a.amount)} ·{' '}
                              {new Intl.DateTimeFormat('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                              }).format(new Date(a.createdAt))}
                              <button
                                type="button"
                                aria-label="Remover vale"
                                className="text-label-secondary hover:text-foreground rounded-full p-0.5"
                                onClick={() => removeAdvance.mutate(a.id)}
                              >
                                <XIcon className="size-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{line.appointments}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrencyBRL(line.base)}
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">
                      {line.commission === null ? '—' : formatCurrencyBRL(line.commission)}
                    </td>
                    <td className="text-label-secondary px-3 py-3 text-right tabular-nums">
                      {line.openAdvances ? `− ${formatCurrencyBRL(line.openAdvances)}` : '—'}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-3 text-right font-semibold tabular-nums',
                        toPay !== null && toPay < 0 && 'text-destructive',
                      )}
                    >
                      {line.payout
                        ? formatCurrencyBRL(line.payout.netAmount)
                        : toPay === null
                          ? '—'
                          : formatCurrencyBRL(toPay)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {line.payout ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="bg-system-green/15 text-delta-good rounded-full px-2.5 py-0.5 text-[12px] font-semibold">
                            Pago em{' '}
                            {new Intl.DateTimeFormat('pt-BR').format(
                              new Date(line.payout.createdAt),
                            )}
                          </span>
                          <button
                            type="button"
                            className="text-label-secondary text-[12px] hover:underline"
                            onClick={() => setReopening(line)}
                          >
                            Desfazer
                          </button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          disabled={line.commission === null || (toPay ?? 0) < 0}
                          onClick={() => setClosing(line)}
                        >
                          Fechar e pagar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-foreground/[0.03] text-[13px]">
                <td className="px-5 py-3 font-semibold" colSpan={3}>
                  Total do mês
                </td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">
                  {formatCurrencyBRL(totals.commission)}
                </td>
                <td className="text-label-secondary px-3 py-3 text-right tabular-nums">
                  {totals.advances ? `− ${formatCurrencyBRL(totals.advances)}` : '—'}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </Surface>
      )}
      <p className="text-label-secondary text-[12px]">
        Comissão sobre o valor cobrado de cada serviço (com desconto e cupom; sem gorjeta e
        produtos), dos atendimentos concluídos no mês. A % própria de um serviço (em Serviços) vale
        no lugar da regra do profissional. Vales saem do caixa na hora e são descontados no
        fechamento.
      </p>

      {closing && (
        <CloseDialog
          line={closing}
          month={month}
          onClose={() => setClosing(null)}
          onDone={() => {
            setClosing(null);
            refresh();
          }}
        />
      )}
      {advanceFor !== null && (
        <AdvanceDialog
          professionals={(data ?? []).map((l) => ({ id: l.professionalId, name: l.name }))}
          onClose={() => setAdvanceFor(null)}
          onDone={() => {
            setAdvanceFor(null);
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={reopening !== null}
        title="Desfazer o fechamento?"
        description={
          reopening
            ? `O pagamento de ${reopening.name} é cancelado no financeiro e os vales voltam a ficar em aberto.`
            : undefined
        }
        confirmLabel="Desfazer fechamento"
        destructive
        pending={reopen.isPending}
        onConfirm={() => reopening?.payout && reopen.mutate(reopening.payout.id)}
        onOpenChange={(open) => !open && setReopening(null)}
      />
    </div>
  );
}

function MethodSelect({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Method)}
      className="bg-background ring-foreground/[0.08] h-10 rounded-xl px-3 ring-1"
      aria-label="Forma de pagamento"
    >
      {PAYMENT_METHODS.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </select>
  );
}

function CloseDialog({
  line,
  month,
  onClose,
  onDone,
}: {
  line: Line;
  month: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = React.useState<Method>('PIX');
  const close = useMutation({
    mutationFn: () =>
      closeCommissionAction({
        professionalId: line.professionalId,
        month,
        paymentMethod: method,
      }).then(unwrapResult),
    onSuccess: ({ net }) => {
      toast.success(
        `Comissão de ${line.name} fechada: ${formatCurrencyBRL(net)} lançados no financeiro.`,
      );
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const net = Math.round(((line.commission ?? 0) - line.openAdvances) * 100) / 100;
  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fechar comissão de {line.name}</DialogTitle>
          <DialogDescription>
            {monthLabel(month)}. O valor entra como despesa &ldquo;Comissões&rdquo; no financeiro.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-[14px]">
          <div className="flex justify-between">
            <span className="text-label-secondary">
              Comissão ({line.appointments} atendimentos)
            </span>
            <span className="tabular-nums">{formatCurrencyBRL(line.commission ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-label-secondary">Vales descontados</span>
            <span className="tabular-nums">− {formatCurrencyBRL(line.openAdvances)}</span>
          </div>
          <div className="border-foreground/[0.08] flex justify-between border-t pt-2 font-semibold">
            <span>A pagar</span>
            <span className="tabular-nums">{formatCurrencyBRL(net)}</span>
          </div>
          <label className="mt-2 flex flex-col gap-1.5">
            <span className="font-medium">Pago com</span>
            <MethodSelect value={method} onChange={setMethod} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button disabled={close.isPending} onClick={() => close.mutate()}>
            {close.isPending ? 'Fechando...' : `Pagar ${formatCurrencyBRL(net)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdvanceDialog({
  professionals,
  onClose,
  onDone,
}: {
  professionals: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [professionalId, setProfessionalId] = React.useState(professionals[0]?.id ?? '');
  const [amount, setAmount] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [method, setMethod] = React.useState<Method>('CASH');
  const save = useMutation({
    mutationFn: () =>
      createAdvanceAction({
        professionalId,
        amount: parseMoney(amount),
        description: description || undefined,
        paymentMethod: method,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Vale lançado. Será descontado no próximo fechamento.');
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar vale</DialogTitle>
          <DialogDescription>
            Adiantamento ao profissional. Sai do caixa agora e é descontado da comissão.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Profissional</span>
            <select
              value={professionalId}
              onChange={(e) => setProfessionalId(e.target.value)}
              className="bg-background ring-foreground/[0.08] h-10 rounded-xl px-3 ring-1"
            >
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Valor (R$)</span>
              <Input
                autoFocus
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Pago com</span>
              <MethodSelect value={method} onChange={setMethod} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Motivo (opcional)</span>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Voltar
            </Button>
            <Button type="submit" disabled={save.isPending || !professionalId}>
              Lançar vale
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
