'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { getServiceStaffingAction } from '@/server/actions/service-actions';

/** O que vai para o servidor: lista vazia = todos fazem pelo preço do serviço. */
export type StaffEntry = { professionalId: string; price: number | null };
type Row = { professionalId: string; selected: boolean; price: string };

/**
 * Quem faz este serviço e por quanto. Só aparece com mais de um profissional ativo. "Todos fazem"
 * é o padrão (o de sempre); escolhendo, cada profissional pode ter o próprio preço — vazio = o
 * preço do serviço.
 */
export function ServiceStaffField({
  open,
  serviceId,
  servicePrice,
  onChange,
}: {
  open: boolean;
  serviceId: string | null;
  servicePrice: number;
  /** `null` = a pessoa não mexeu (mantém o que está salvo). */
  onChange: (value: StaffEntry[] | null) => void;
}) {
  const { data } = useQuery({
    queryKey: ['service-staffing', serviceId],
    queryFn: () => getServiceStaffingAction({ serviceId }).then(unwrapResult),
    enabled: open,
  });
  const [edited, setEdited] = React.useState<{ mode: 'all' | 'pick'; rows: Row[] } | null>(null);

  if (!data || data.professionals.length < 2) return null;

  const saved = {
    mode: (data.staffing.professionalIds ? 'pick' : 'all') as 'all' | 'pick',
    rows: data.professionals.map((p) => ({
      professionalId: p.id,
      selected: data.staffing.professionalIds?.includes(p.id) ?? false,
      price: data.staffing.prices[p.id] !== undefined ? String(data.staffing.prices[p.id]) : '',
    })),
  };
  const state = edited ?? saved;

  const emit = (next: { mode: 'all' | 'pick'; rows: Row[] }) => {
    setEdited(next);
    onChange(
      next.mode === 'all'
        ? []
        : next.rows
            .filter((r) => r.selected)
            .map((r) => ({
              professionalId: r.professionalId,
              price: r.price.trim() === '' ? null : Number(r.price.replace(',', '.')),
            })),
    );
  };
  const updateRow = (id: string, patch: Partial<Row>) =>
    emit({
      ...state,
      rows: state.rows.map((r) => (r.professionalId === id ? { ...r, ...patch } : r)),
    });
  const selectedCount = state.rows.filter((r) => r.selected).length;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Quem faz este serviço</span>
      <SegmentedControl
        size="sm"
        className="self-start"
        value={state.mode}
        onValueChange={(mode: string) =>
          emit({
            mode: mode as 'all' | 'pick',
            // Ao passar a escolher, começa com todos marcados (é só desmarcar quem não faz).
            rows:
              mode === 'pick' && !state.rows.some((r) => r.selected)
                ? state.rows.map((r) => ({ ...r, selected: true }))
                : state.rows,
          })
        }
        options={[
          { value: 'all', label: 'Todos, mesmo preço' },
          { value: 'pick', label: 'Escolher profissionais e preços' },
        ]}
      />
      {state.mode === 'pick' && (
        <div className="ring-foreground/[0.06] divide-foreground/[0.06] flex flex-col divide-y rounded-xl ring-1">
          {data.professionals.map((p) => {
            const row = state.rows.find((r) => r.professionalId === p.id)!;
            return (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-[14px]">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) => updateRow(p.id, { selected: e.target.checked })}
                  />
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                    aria-hidden
                  />
                  <span className={cn('truncate', !row.selected && 'text-label-secondary')}>
                    {p.name}
                  </span>
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  className="h-8 w-32"
                  disabled={!row.selected}
                  placeholder={formatCurrencyBRL(servicePrice)}
                  value={row.price}
                  onChange={(e) => updateRow(p.id, { price: e.target.value })}
                  aria-label={`Preço com ${p.name}`}
                />
              </div>
            );
          })}
        </div>
      )}
      <p className="text-label-secondary text-[12px]">
        {state.mode === 'all'
          ? 'Todos os profissionais fazem este serviço, pelo preço acima.'
          : selectedCount === 0
            ? 'Marque pelo menos um profissional (sem nenhum, todos fazem).'
            : 'Só os marcados aparecem para este serviço na agenda e no link. Preço vazio = preço do serviço.'}
      </p>
    </div>
  );
}
