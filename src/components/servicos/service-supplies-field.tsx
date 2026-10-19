'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listActiveProductsAction } from '@/server/actions/stock-actions';

/** Linha da lista; `productId` vazio = linha nova ainda sem produto escolhido. */
export type SupplyRow = { productId: string; quantity: number | string };

/**
 * "Este serviço consome algo do estoque?" Cada atendimento concluído baixa os materiais da lista;
 * se a conclusão for desfeita, eles voltam. O sino avisa quando o estoque está baixo.
 */
export function ServiceSuppliesField({
  value,
  onChange,
}: {
  value: SupplyRow[];
  onChange: (rows: SupplyRow[]) => void;
}) {
  const { data: products } = useQuery({
    queryKey: ['products-active'],
    queryFn: () => listActiveProductsAction(),
  });
  const enabled = value.length > 0;
  const noProducts = products && products.length === 0;

  const update = (index: number, patch: Partial<SupplyRow>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="bg-foreground/[0.03] flex flex-col gap-3 rounded-2xl p-3.5">
      <label className="flex items-center justify-between gap-3">
        <span className="flex flex-col">
          <span className="text-sm font-medium">Este serviço consome algo do estoque?</span>
          <span className="text-label-secondary text-[12px]">
            A cada atendimento concluído, os materiais saem do estoque sozinhos.
          </span>
        </span>
        <Switch
          checked={enabled}
          disabled={!!noProducts && !enabled}
          onCheckedChange={(on: boolean) => onChange(on ? [{ productId: '', quantity: 1 }] : [])}
          aria-label="Este serviço consome algo do estoque"
        />
      </label>

      {noProducts && !enabled && (
        <p className="text-label-secondary text-[12px]">
          Cadastre os produtos em{' '}
          <Link href="/estoque" className="text-system-blue underline">
            Estoque
          </Link>{' '}
          primeiro para escolher o que este serviço usa.
        </p>
      )}

      {enabled && (
        <div className="flex flex-col gap-2">
          {value.map((row, index) => {
            const chosen = products?.find((p) => p.id === row.productId);
            const taken = new Set(value.map((r) => r.productId));
            return (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Select
                    value={row.productId}
                    onValueChange={(productId: string) => update(index, { productId })}
                  >
                    <SelectTrigger className="min-w-0 flex-1" aria-label={`Material ${index + 1}`}>
                      <SelectValue placeholder="Escolha o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {(products ?? []).map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          disabled={taken.has(p.id) && p.id !== row.productId}
                        >
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    className="w-20 shrink-0"
                    aria-label={`Quantidade do material ${index + 1}`}
                    value={row.quantity}
                    onChange={(e) => update(index, { quantity: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover material"
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                {chosen && (
                  <p
                    className={
                      chosen.quantity < Number(row.quantity || 0)
                        ? 'text-system-red text-[12px]'
                        : 'text-label-secondary text-[12px]'
                    }
                  >
                    Em estoque: {chosen.quantity}
                    {chosen.quantity < Number(row.quantity || 0) &&
                      ' — insuficiente para um atendimento'}
                    {chosen.quantity >= Number(row.quantity || 0) &&
                      chosen.quantity <= chosen.minQuantity &&
                      ' — já está no mínimo'}
                  </p>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => onChange([...value, { productId: '', quantity: 1 }])}
          >
            <PlusIcon /> Adicionar material
          </Button>
        </div>
      )}
    </div>
  );
}
