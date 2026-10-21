'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { createInstallmentsAction } from '@/server/actions/finance-actions';

/** Conta parcelada: cria as parcelas como pendentes (nada é marcado como pago). */
export function InstallmentsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    type: 'EXPENSE' as 'INCOME' | 'EXPENSE',
    description: '',
    total: '',
    count: '3',
    first: '',
  });
  const total = Number(form.total.replace(',', '.')) || 0;
  const count = Number(form.count) || 0;
  const save = useMutation({
    mutationFn: () =>
      createInstallmentsAction({
        type: form.type,
        description: form.description,
        totalAmount: total,
        count,
        firstDueDate: new Date(`${form.first}T12:00:00`),
      }).then(unwrapResult),
    onSuccess: (r) => {
      toast.success(`${r.count} parcelas lançadas como pendentes.`);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
      queryClient.invalidateQueries({ queryKey: ['sold-due-received'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar parcelado</DialogTitle>
          <DialogDescription>
            Cada parcela vira um lançamento pendente com vencimento mensal.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <SegmentedControl
            size="sm"
            value={form.type}
            onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}
            options={[
              { value: 'EXPENSE', label: 'A pagar' },
              { value: 'INCOME', label: 'A receber' },
            ]}
          />
          <Input
            placeholder="Descrição (ex.: Equipamento novo)"
            maxLength={180}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            aria-label="Descrição"
          />
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-label-secondary">Total (R$)</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.total}
                onChange={(e) => setForm((f) => ({ ...f, total: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-label-secondary">Parcelas</span>
              <Input
                type="number"
                min={2}
                max={36}
                value={form.count}
                onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-label-secondary">1º vencimento</span>
              <Input
                type="date"
                value={form.first}
                onChange={(e) => setForm((f) => ({ ...f, first: e.target.value }))}
              />
            </label>
          </div>
          {total > 0 && count >= 2 && (
            <p className="text-label-secondary text-[13px]">
              {count} × cerca de {formatCurrencyBRL(Math.floor((total * 100) / count) / 100)} (a
              diferença de centavos vai na primeira).
            </p>
          )}
          <Button
            type="submit"
            disabled={
              !form.description.trim() || total <= 0 || count < 2 || !form.first || save.isPending
            }
          >
            Lançar parcelas
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
