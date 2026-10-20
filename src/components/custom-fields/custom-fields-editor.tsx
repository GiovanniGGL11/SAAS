'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { displayValue, type CustomFieldEntity } from '@/lib/custom-fields';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getFieldValuesAction, setFieldValuesAction } from '@/server/actions/custom-field-actions';

type Field =
  Awaited<ReturnType<typeof getFieldValuesAction>> extends infer R
    ? R extends { ok: true; data: (infer D)[] }
      ? D
      : never
    : never;

/**
 * Respostas dos campos personalizados de um registro. Mostra só o que a pessoa pode ver; edita só
 * o que ela pode editar. Nada aparece se a empresa não tiver campos (ou o plano não incluir).
 */
export function CustomFieldsEditor({
  entity,
  recordId,
  title = 'Informações adicionais',
}: {
  entity: CustomFieldEntity;
  recordId: string;
  title?: string;
}) {
  const queryClient = useQueryClient();
  const key = ['custom-field-values', entity, recordId];
  const { data: fields = [] } = useQuery({
    queryKey: key,
    queryFn: () => getFieldValuesAction({ entity, recordId }).then(unwrapResult),
  });
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const save = useMutation({
    mutationFn: () => setFieldValuesAction({ entity, recordId, values: draft }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Informações salvas.');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (fields.length === 0) return null;
  const editable = fields.filter((f) => f.canEdit);

  return (
    <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {!editing && editable.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(Object.fromEntries(editable.map((f) => [f.id, f.value])));
              setEditing(true);
            }}
          >
            Editar
          </Button>
        )}
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {editable.map((f) => (
            <FieldInput
              key={f.id}
              field={f}
              value={draft[f.id]}
              onChange={(v) => setDraft((d) => ({ ...d, [f.id]: v }))}
            />
          ))}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 text-[13px]">
          {fields.map((f) => (
            <React.Fragment key={f.id}>
              <dt className="text-label-secondary">{f.label}</dt>
              <dd className="break-words whitespace-pre-line">{displayValue(f, f.value)}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </section>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <span className="text-label-secondary">
      {field.label}
      {field.required && ' *'}
      {field.description && <span className="block text-[11px]">{field.description}</span>}
    </span>
  );
  const options = field.options.filter(
    (o) => !o.archived || (Array.isArray(value) ? value.includes(o.id) : value === o.id),
  );
  switch (field.type) {
    case 'long_text':
      return (
        <label className="flex flex-col gap-1 text-[13px]">
          {label}
          <Textarea
            rows={3}
            maxLength={4000}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
    case 'number':
      return (
        <label className="flex flex-col gap-1 text-[13px]">
          {label}
          <Input
            type="number"
            inputMode="decimal"
            value={value == null ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
        </label>
      );
    case 'date':
      return (
        <label className="flex flex-col gap-1 text-[13px]">
          {label}
          <Input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
          />
        </label>
      );
    case 'boolean':
      return (
        <label className="flex items-center justify-between gap-3 text-[13px]">
          {label}
          <Switch
            checked={value === true}
            onCheckedChange={(v: boolean) => onChange(v)}
            aria-label={field.label}
          />
        </label>
      );
    case 'single_select':
      return (
        <label className="flex flex-col gap-1 text-[13px]">
          {label}
          <Select
            value={(value as string) ?? 'none'}
            onValueChange={(v: string) => onChange(v === 'none' ? null : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      );
    case 'multi_select': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="flex flex-col gap-1 text-[13px]">
          <legend className="mb-1">{label}</legend>
          <div className="flex flex-wrap gap-1.5">
            {options.map((o) => {
              const on = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onChange(on ? selected.filter((s) => s !== o.id) : [...selected, o.id])
                  }
                  className={cn(
                    'rounded-full px-3 py-1 text-[13px]',
                    on ? 'bg-system-blue text-white' : 'bg-foreground/[0.06]',
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      );
    }
    default:
      return (
        <label className="flex flex-col gap-1 text-[13px]">
          {label}
          <Input
            maxLength={200}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
  }
}
