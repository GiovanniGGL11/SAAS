'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from 'lucide-react';
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
import { saveStagesAction } from '@/server/actions/crm-actions';

type Row = { id?: string; name: string; kind: 'OPEN' | 'WON' | 'LOST'; archived?: boolean };

/** Etapas do funil (administrador): renomear, reordenar, criar e arquivar. */
export function StagesDialog({
  open,
  onOpenChange,
  stages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: { id: string; name: string; kind: string }[];
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loadedFor, setLoadedFor] = React.useState<boolean>(false);
  if (open && !loadedFor) {
    setLoadedFor(true);
    setRows(stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind as Row['kind'] })));
  }
  if (!open && loadedFor) setLoadedFor(false);

  const save = useMutation({
    mutationFn: () => saveStagesAction(rows).then(unwrapResult),
    onSuccess: () => {
      toast.success('Etapas salvas.');
      queryClient.invalidateQueries({ queryKey: ['crm-stages'] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
  });
  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const swap = (i: number, j: number) =>
    setRows((r) => {
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Etapas do funil</DialogTitle>
          <DialogDescription>
            Ganho e perdido encerram a oportunidade. Etapa com oportunidades abertas só é arquivada
            depois de movê-las.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <li key={row.id ?? `new-${i}`} className={row.archived ? 'opacity-50' : ''}>
              <div className="flex items-center gap-1.5">
                <Input
                  className="flex-1"
                  maxLength={60}
                  value={row.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  aria-label={`Nome da etapa ${i + 1}`}
                />
                <Select
                  value={row.kind}
                  onValueChange={(v: string) => update(i, { kind: v as Row['kind'] })}
                >
                  <SelectTrigger className="w-32" aria-label="Tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Em andamento</SelectItem>
                    <SelectItem value="WON">Ganho</SelectItem>
                    <SelectItem value="LOST">Perdido</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Subir"
                  onClick={() => swap(i, i - 1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Descer"
                  onClick={() => swap(i, i + 1)}
                >
                  <ArrowDownIcon />
                </Button>
              </div>
              <label className="text-label-secondary mt-1 flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  checked={!!row.archived}
                  onChange={(e) => update(i, { archived: e.target.checked })}
                />
                Arquivar
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={rows.length >= 20}
            onClick={() => setRows((r) => [...r, { name: '', kind: 'OPEN' }])}
          >
            <PlusIcon /> Etapa
          </Button>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Salvando…' : 'Salvar etapas'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
