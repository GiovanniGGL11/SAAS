'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';

import { unwrapResult } from '@/lib/action-result';
import {
  isSelect,
  type CustomFieldEntity,
  type FieldDefinition,
  type FieldFilter,
} from '@/lib/custom-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listFieldsAction } from '@/server/actions/custom-field-actions';

export type FieldCriterion = { entity: CustomFieldEntity; fieldId: string; filter: FieldFilter };

type Draft = {
  mode: 'match' | 'filled' | 'empty';
  text: string;
  bool: 'yes' | 'no';
  option: string;
  min: string;
  max: string;
  from: string;
  to: string;
};
const EMPTY_DRAFT: Draft = {
  mode: 'match',
  text: '',
  bool: 'yes',
  option: '',
  min: '',
  max: '',
  from: '',
  to: '',
};

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) ? n : undefined;
};

/** Monta o filtro a partir do que foi preenchido; `null` = ainda não dá para filtrar. */
function toFilter(field: FieldDefinition, d: Draft): FieldFilter | null {
  if (d.mode === 'filled') return { kind: 'filled' };
  if (d.mode === 'empty') return { kind: 'empty' };
  switch (field.type) {
    case 'short_text':
    case 'long_text':
      return d.text.trim() ? { kind: 'text', text: d.text.trim() } : null;
    case 'boolean':
      return { kind: 'boolean', value: d.bool === 'yes' };
    case 'single_select':
    case 'multi_select':
      return d.option ? { kind: 'option', optionId: d.option } : null;
    case 'number': {
      const min = num(d.min);
      const max = num(d.max);
      return min === undefined && max === undefined ? null : { kind: 'number', min, max };
    }
    case 'date':
      return d.from || d.to
        ? { kind: 'date', from: d.from || undefined, to: d.to || undefined }
        : null;
  }
}

/**
 * "Filtrar por campo": escolhe um campo personalizado e a condição. Só aparece quando há campos
 * visíveis para a pessoa (e no plano com campos personalizados). A filtragem é feita no servidor.
 */
export function CustomFieldFilter({
  entity,
  onChange,
}: {
  entity: CustomFieldEntity;
  onChange: (criterion: FieldCriterion | null) => void;
}) {
  const { data: fields = [] } = useQuery({
    queryKey: ['custom-fields', entity, 'filter'],
    queryFn: () => listFieldsAction({ entity }).then(unwrapResult),
  });
  const [fieldId, setFieldId] = React.useState('');
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (fields.length === 0) return null;
  const field = fields.find((f) => f.id === fieldId);

  const emit = (nextFieldId: string, next: Draft, delay = 0) => {
    if (timer.current) clearTimeout(timer.current);
    const run = () => {
      const f = fields.find((x) => x.id === nextFieldId);
      const filter = f ? toFilter(f, next) : null;
      onChange(f && filter ? { entity, fieldId: f.id, filter } : null);
    };
    if (delay) timer.current = setTimeout(run, delay);
    else run();
  };
  // Digitação espera um instante; escolhas aplicam na hora.
  const set = (patch: Partial<Draft>, delay = 0) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    emit(fieldId, next, delay);
  };
  const clear = () => {
    setFieldId('');
    setDraft(EMPTY_DRAFT);
    emit('', EMPTY_DRAFT);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-label-secondary">Filtrar por campo:</span>
      <Select
        value={fieldId || undefined}
        onValueChange={(v: string) => {
          setFieldId(v);
          setDraft(EMPTY_DRAFT);
          emit(v, EMPTY_DRAFT);
        }}
      >
        <SelectTrigger className="h-8 w-48" aria-label="Campo personalizado">
          <SelectValue placeholder="Escolha um campo" />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {field && (
        <>
          <Select
            value={draft.mode}
            onValueChange={(v: string) => set({ mode: v as Draft['mode'] })}
          >
            <SelectTrigger className="h-8 w-40" aria-label="Condição">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="match">
                {field.type === 'short_text' || field.type === 'long_text'
                  ? 'Contém'
                  : field.type === 'number' || field.type === 'date'
                    ? 'Entre'
                    : 'É igual a'}
              </SelectItem>
              <SelectItem value="filled">Preenchido</SelectItem>
              <SelectItem value="empty">Sem resposta</SelectItem>
            </SelectContent>
          </Select>

          {draft.mode === 'match' &&
            (field.type === 'short_text' || field.type === 'long_text' ? (
              <Input
                className="h-8 w-48"
                placeholder="Texto"
                value={draft.text}
                maxLength={200}
                onChange={(e) => set({ text: e.target.value }, 400)}
                aria-label="Texto do filtro"
              />
            ) : field.type === 'boolean' ? (
              <Select
                value={draft.bool}
                onValueChange={(v: string) => set({ bool: v as 'yes' | 'no' })}
              >
                <SelectTrigger className="h-8 w-28" aria-label="Sim ou não">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Sim</SelectItem>
                  <SelectItem value="no">Não</SelectItem>
                </SelectContent>
              </Select>
            ) : isSelect(field.type) ? (
              <Select
                value={draft.option || undefined}
                onValueChange={(v: string) => set({ option: v })}
              >
                <SelectTrigger className="h-8 w-48" aria-label="Opção">
                  <SelectValue placeholder="Escolha a opção" />
                </SelectTrigger>
                <SelectContent>
                  {field.options
                    .filter((o) => !o.archived)
                    .map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : field.type === 'number' ? (
              <>
                <Input
                  className="h-8 w-24"
                  inputMode="decimal"
                  placeholder="De"
                  value={draft.min}
                  onChange={(e) => set({ min: e.target.value }, 400)}
                  aria-label="Valor mínimo"
                />
                <Input
                  className="h-8 w-24"
                  inputMode="decimal"
                  placeholder="Até"
                  value={draft.max}
                  onChange={(e) => set({ max: e.target.value }, 400)}
                  aria-label="Valor máximo"
                />
              </>
            ) : (
              <>
                <Input
                  type="date"
                  className="h-8 w-40"
                  value={draft.from}
                  onChange={(e) => set({ from: e.target.value }, 400)}
                  aria-label="De"
                />
                <Input
                  type="date"
                  className="h-8 w-40"
                  value={draft.to}
                  onChange={(e) => set({ to: e.target.value }, 400)}
                  aria-label="Até"
                />
              </>
            ))}

          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={clear}>
            <XIcon className="size-3.5" /> Limpar
          </Button>
        </>
      )}
    </div>
  );
}
