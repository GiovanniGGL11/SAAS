'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

const STATUS_LABELS: Record<string, string> = {
  PAID: 'Pago',
  PENDING: 'Pendente',
  CANCELED: 'Cancelado',
};

export function FinanceView() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingTransaction, setEditingTransaction] =
    React.useState<SerializedTransaction | null>(null);
  const [defaultType, setDefaultType] = React.useState<'INCOME' | 'EXPENSE'>('INCOME');

  const { data: summary } = useQuery({
    queryKey: ['cash-flow', 'last30'],
    queryFn: () => getCashFlowSummaryAction({ preset: 'last30' }),
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground text-sm">
            Fluxo de caixa dos últimos 30 dias, contas a pagar e a receber.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openCreate('EXPENSE')}>
            <PlusIcon className="size-4" />
            Nova saída
          </Button>
          <Button onClick={() => openCreate('INCOME')}>
            <PlusIcon className="size-4" />
            Nova entrada
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Entradas" value={formatCurrencyBRL(summary.income)} />
          <StatTile label="Saídas" value={formatCurrencyBRL(summary.expense)} />
          <StatTile label="Saldo" value={formatCurrencyBRL(summary.balance)} />
          <StatTile
            label="A receber / a pagar"
            value={`${formatCurrencyBRL(summary.pendingReceivables)} / ${formatCurrencyBRL(summary.pendingPayables)}`}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!transactions || transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                  Nenhum lançamento ainda.
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => openEdit(t)}>
                  <TableCell className="font-medium">{t.description}</TableCell>
                  <TableCell className="text-muted-foreground">{t.category || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Intl.DateTimeFormat('pt-BR').format(new Date(t.createdAt))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.status === 'PAID' ? 'default' : 'outline'}>
                      {STATUS_LABELS[t.status]}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={t.type === 'INCOME' ? 'text-delta-good' : 'text-destructive'}
                  >
                    {t.type === 'INCOME' ? '+' : '-'}
                    {formatCurrencyBRL(t.amount)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {t.status === 'PENDING' && (
                      <Button size="sm" variant="ghost" onClick={() => markPaid.mutate(t.id)}>
                        Marcar pago
                      </Button>
                    )}
                    {t.status !== 'CANCELED' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => cancel.mutate(t.id)}
                      >
                        Cancelar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TransactionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        transaction={editingTransaction}
        defaultType={defaultType}
      />
    </div>
  );
}
