'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlusIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

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
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { STOCK_UNITS, formatQty, unitShort, type StockUnit } from '@/lib/stock-units';
import { createProductAction, listActiveProductsAction } from '@/server/actions/stock-actions';

/** Linha da lista; `productId` vazio = linha nova ainda sem produto escolhido. */
export type SupplyRow = { productId: string; quantity: number | string };

/**
 * "Este serviço consome algo do estoque?" Cada atendimento concluído baixa os materiais da lista
 * (na unidade de cada produto: par de luvas, ml de sérum...); se a conclusão for desfeita, eles
 * voltam. Dá para cadastrar um material novo aqui mesmo, sem sair do serviço.
 */
export function ServiceSuppliesField({
  value,
  onChange,
}: {
  value: SupplyRow[];
  onChange: (rows: SupplyRow[]) => void;
}) {
  const queryClient = useQueryClient();
  const { data: products } = useQuery({
    queryKey: ['products-active'],
    queryFn: () => listActiveProductsAction(),
  });
  const [creatingFor, setCreatingFor] = React.useState<number | null>(null);
  const enabled = value.length > 0;

  const update = (index: number, patch: Partial<SupplyRow>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  // Custo de material de um atendimento (custo por unidade × quantidade de cada material).
  const materialCost = value.reduce((sum, row) => {
    const product = products?.find((p) => p.id === row.productId);
    return sum + (product ? product.costPrice * (Number(row.quantity) || 0) : 0);
  }, 0);

  return (
    <div className="bg-foreground/[0.03] flex flex-col gap-3 rounded-2xl p-3.5">
      <label className="flex items-center justify-between gap-3">
        <span className="flex flex-col">
          <span className="text-sm font-medium">Este serviço consome algo do estoque?</span>
          <span className="text-label-secondary text-[12px]">
            Ex.: limpeza de pele gasta 1 par de luvas, 1 máscara, 1 touca e 20 ml de sérum. A cada
            atendimento concluído, os materiais saem do estoque sozinhos.
          </span>
        </span>
        <Switch
          checked={enabled}
          onCheckedChange={(on: boolean) => onChange(on ? [{ productId: '', quantity: 1 }] : [])}
          aria-label="Este serviço consome algo do estoque"
        />
      </label>

      {enabled && (
        <div className="flex flex-col gap-2">
          {value.map((row, index) => {
            const chosen = products?.find((p) => p.id === row.productId);
            const taken = new Set(value.map((r) => r.productId));
            const qty = Number(row.quantity || 0);
            return (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Select
                    value={row.productId}
                    onValueChange={(productId: string) => {
                      if (productId === '__novo__') setCreatingFor(index);
                      else update(index, { productId });
                    }}
                  >
                    <SelectTrigger className="min-w-0 flex-1" aria-label={`Material ${index + 1}`}>
                      <SelectValue placeholder="Escolha o material" />
                    </SelectTrigger>
                    <SelectContent>
                      {(products ?? []).map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          disabled={taken.has(p.id) && p.id !== row.productId}
                        >
                          {p.name} · {formatQty(p.quantity, p.unit)}
                        </SelectItem>
                      ))}
                      <SelectItem value="__novo__">+ Cadastrar material novo</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex shrink-0 items-center gap-1">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      className="w-20"
                      aria-label={`Quantidade do material ${index + 1}`}
                      value={row.quantity}
                      onChange={(e) => update(index, { quantity: e.target.value })}
                    />
                    <span className="text-label-secondary w-7 text-[12px]">
                      {chosen ? unitShort(chosen.unit) : ''}
                    </span>
                  </div>
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
                      chosen.quantity < qty
                        ? 'text-system-red text-[12px]'
                        : 'text-label-secondary text-[12px]'
                    }
                  >
                    Em estoque: {formatQty(chosen.quantity, chosen.unit)}
                    {qty > 0 && chosen.quantity >= qty && (
                      <> · dá para {Math.floor(chosen.quantity / qty)} atendimento(s)</>
                    )}
                    {chosen.quantity < qty && ' — insuficiente para um atendimento'}
                    {chosen.quantity >= qty &&
                      chosen.minQuantity > 0 &&
                      chosen.quantity <= chosen.minQuantity &&
                      ' — já está no mínimo'}
                  </p>
                )}
                {creatingFor === index && (
                  <NewMaterialForm
                    onCancel={() => setCreatingFor(null)}
                    onCreated={async (productId) => {
                      await queryClient.invalidateQueries({ queryKey: ['products-active'] });
                      await queryClient.invalidateQueries({ queryKey: ['products'] });
                      update(index, { productId });
                      setCreatingFor(null);
                    }}
                  />
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange([...value, { productId: '', quantity: 1 }])}
            >
              <PlusIcon /> Adicionar material
            </Button>
            {materialCost > 0 && (
              <span className="text-[12px]">
                Custo de material por atendimento:{' '}
                <strong className="tabular-nums">{formatCurrencyBRL(materialCost)}</strong>
              </span>
            )}
          </div>
          <p className="text-label-secondary text-[12px]">
            Para dar entrada de compras e ver o histórico, use o{' '}
            <Link href="/estoque" className="text-system-blue underline">
              Estoque
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}

/** Cadastro rápido de material sem sair do serviço (nome, unidade, saldo atual e custo). */
function NewMaterialForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (productId: string) => void;
}) {
  const [name, setName] = React.useState('');
  const [unit, setUnit] = React.useState<StockUnit>('un');
  const [quantity, setQuantity] = React.useState('');
  const [cost, setCost] = React.useState('');
  const create = useMutation({
    mutationFn: () =>
      createProductAction({
        name: name.trim(),
        unit,
        quantity: Math.max(0, Math.round(Number(quantity) || 0)),
        minQuantity: 0,
        costPrice: Number(cost.replace(',', '.')) || 0,
        salePrice: 0,
      }).then(unwrapResult),
    onSuccess: (product) => {
      toast.success(`${product.name} cadastrado no estoque.`);
      onCreated(product.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const u = unitShort(unit);
  return (
    <div className="bg-background ring-foreground/[0.08] mt-1 flex flex-col gap-2 rounded-xl p-3 ring-1">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <PackagePlusIcon className="size-4" /> Material novo no estoque
      </div>
      <Input
        autoFocus
        placeholder="Nome (ex.: Luva descartável)"
        value={name}
        maxLength={200}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2">
        <Select value={unit} onValueChange={(v: string) => setUnit(v as StockUnit)}>
          <SelectTrigger aria-label="Unidade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STOCK_UNITS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          inputMode="numeric"
          placeholder={`Tenho (${u})`}
          aria-label={`Quantidade em estoque (${u})`}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
        />
        <Input
          inputMode="decimal"
          placeholder={`Custo/${u}`}
          aria-label={`Custo por ${u} (R$)`}
          value={cost}
          onChange={(e) => setCost(e.target.value.replace(/[^\d,.]/g, ''))}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? 'Cadastrando...' : 'Cadastrar e usar'}
        </Button>
      </div>
    </div>
  );
}
