'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  ScaleIcon,
  WalletIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PageHeader, Surface } from '@/components/layout/page';
import { ListToolbar, SearchField, matchesSearch } from '@/components/layout/list-controls';
import { REPORT_PRESETS, type ReportPreset } from '@/lib/validations/report';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatTile } from '@/components/dashboard/stat-tile';
import { TransactionDrawer } from '@/components/financeiro/transaction-drawer';
import {
  cancelTransactionAction,
  getCashFlowSummaryAction,
  listTransactionsAction,
  markTransactionPaidAction,
} from '@/server/actions/finance-actions';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { SerializedTransaction } from '@/lib/serialize';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<string, string> = {
  PAID: 'Pago',
  PENDING: 'Pendente',
  CANCELED: 'Cancelado',
};

export function FinanceView() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingTransaction, setEditingTransaction] = React.useState<SerializedTransaction | null>(
    null,
  );
  const [defaultType, setDefaultType] = React.useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [preset, setPreset] = React.useState<ReportPreset>('last30');
  const [filter, setFilter] = React.useState<'all' | 'income' | 'expense' | 'pending'>('all');
  const [search, setSearch] = React.useState('');
  const [nowRef] = React.useState(() => Date.now());

  const { data: summary } = useQuery({
    queryKey: ['cash-flow', preset],
    queryFn: () => getCashFlowSummaryAction({ preset }),
  });

  const { data: transactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => listTransactionsAction({}),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => markTransactionPaidAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelTransactionAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openCreate(type: 'INCOME' | 'EXPENSE') {
    setEditingTransaction(null);
    setDefaultType(type);
    setDrawerOpen(true);
  }

  function openEdit(transaction: SerializedTransaction) {
    setEditingTransaction(transaction);
    setDrawerOpen(true);
  }

  const now = nowRef;
  const isOverdue = (t: SerializedTransaction) =>
    t.status === 'PENDING' && t.dueDate !== null && new Date(t.dueDate).getTime() < now;
  const overdueCount = (transactions ?? []).filter(isOverdue).length;

  const filtered = (transactions ?? []).filter((t) => {
    if (filter === 'income' && t.type !== 'INCOME') return false;
    if (filter === 'expense' && t.type !== 'EXPENSE') return false;
    if (filter === 'pending' && t.status !== 'PENDING') return false;
    return matchesSearch(search, t.description, t.category);
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Financeiro"
        description="Fluxo de caixa, contas a pagar e a receber."
        actions={
          <>
            <Button variant="outline" onClick={() => openCreate('EXPENSE')}>
              <ArrowUpRightIcon className="text-system-red size-4" />
              Nova saída
            </Button>
            <Button onClick={() => openCreate('INCOME')}>
              <ArrowDownLeftIcon className="size-4" />
              Nova entrada
            </Button>
          </>
        }
      />

      <SegmentedControl
        value={preset}
        onValueChange={setPreset}
        options={REPORT_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
        className="self-start"
      />

      {summary ? (
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          <StatTile
            index={0}
            label="Entradas"
            value={formatCurrencyBRL(summary.income)}
            icon={ArrowDownLeftIcon}
            iconColor="var(--system-green)"
          />
          <StatTile
            index={1}
            label="Saídas"
            value={formatCurrencyBRL(summary.expense)}
            icon={ArrowUpRightIcon}
            iconColor="var(--system-red)"
          />
          <StatTile
            index={2}
            label="Saldo"
            value={formatCurrencyBRL(summary.balance)}
            valueClassName={summary.balance < 0 ? 'text-system-red' : undefined}
            icon={ScaleIcon}
            iconColor="var(--system-blue)"
          />
          <StatTile
            index={3}
            label="Pendentes"
            value={formatCurrencyBRL(summary.pendingReceivables - summary.pendingPayables)}
            hint={`${formatCurrencyBRL(summary.pendingReceivables)} a receber · ${formatCurrencyBRL(summary.pendingPayables)} a pagar`}
            icon={ClockIcon}
            iconColor="#ff9500"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-[22px]" />
          ))}
        </div>
      )}

      {overdueCount > 0 && (
        <button
          type="button"
          onClick={() => setFilter('pending')}
          className="bg-system-red/10 hover:bg-system-red/15 flex items-center gap-3 rounded-[18px] px-4 py-3 text-left text-[14px] transition-colors"
        >
          <span className="bg-system-red flex size-8 shrink-0 items-center justify-center rounded-full text-white">
            <ClockIcon className="size-4" />
          </span>
          <span className="flex-1 font-semibold">
            {overdueCount}{' '}
            {overdueCount === 1 ? 'lançamento pendente vencido' : 'lançamentos pendentes vencidos'}
          </span>
          <ChevronRightIcon className="text-label-secondary size-4" />
        </button>
      )}

      <ListToolbar>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar lançamento" />
        <SegmentedControl
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'income', label: 'Entradas' },
            { value: 'expense', label: 'Saídas' },
            { value: 'pending', label: 'Pendentes' },
          ]}
        />
      </ListToolbar>

      <Surface>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState
                    icon={WalletIcon}
                    title={
                      !transactions || transactions.length === 0
                        ? 'Nenhum lançamento ainda'
                        : 'Nenhum lançamento encontrado'
                    }
                    description={
                      !transactions || transactions.length === 0
                        ? 'Entradas e saídas aparecem aqui, incluindo as geradas pela Agenda.'
                        : 'Ajuste a busca ou o filtro.'
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => {
                const overdue = isOverdue(t);
                return (
                  <TableRow
                    key={t.id}
                    className={cn('cursor-pointer', t.status === 'CANCELED' && 'opacity-50')}
                    onClick={() => openEdit(t)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-full',
                            t.type === 'INCOME'
                              ? 'bg-system-green/15 text-delta-good'
                              : 'bg-system-red/12 text-destructive',
                          )}
                        >
                          {t.type === 'INCOME' ? (
                            <ArrowDownLeftIcon className="size-4" />
                          ) : (
                            <ArrowUpRightIcon className="size-4" />
                          )}
                        </span>
                        <span
                          className={cn('font-medium', t.status === 'CANCELED' && 'line-through')}
                        >
                          {t.description}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-label-secondary">{t.category || '—'}</TableCell>
                    <TableCell className="text-label-secondary tabular-nums">
                      {new Intl.DateTimeFormat('pt-BR').format(new Date(t.createdAt))}
                      {t.status === 'PENDING' && t.dueDate && (
                        <div
                          className={cn('text-[12px]', overdue && 'text-system-red font-medium')}
                        >
                          vence {new Intl.DateTimeFormat('pt-BR').format(new Date(t.dueDate))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          t.status === 'PAID' && 'bg-system-green/15 text-delta-good',
                          t.status === 'PENDING' &&
                            (overdue
                              ? 'bg-system-red/12 text-destructive'
                              : 'bg-[#ff9500]/15 text-[#b25f00] dark:text-[#ffb340]'),
                          t.status === 'CANCELED' && 'bg-foreground/[0.06] text-label-secondary',
                        )}
                      >
                        {overdue ? 'Vencido' : STATUS_LABELS[t.status]}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        t.type === 'INCOME' ? 'text-delta-good' : 'text-foreground',
                      )}
                    >
                      {t.type === 'INCOME' ? '+' : '−'}
                      {formatCurrencyBRL(t.amount)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                      {t.status === 'PENDING' && (
                        <Button size="sm" variant="secondary" onClick={() => markPaid.mutate(t.id)}>
                          <CheckIcon className="size-3.5" />
                          Marcar pago
                        </Button>
                      )}
                      {t.status !== 'CANCELED' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            if (window.confirm(`Cancelar o lançamento "${t.description}"?`)) {
                              cancel.mutate(t.id);
                            }
                          }}
                        >
                          Cancelar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Surface>

      <TransactionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        transaction={editingTransaction}
        defaultType={defaultType}
      />
    </div>
  );
}
