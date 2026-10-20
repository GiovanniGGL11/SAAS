'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_TYPES,
  ENTITY_LABEL,
  TYPE_LABEL,
  isSelect,
  type CustomFieldEntity,
  type CustomFieldType,
} from '@/lib/custom-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Switch } from '@/components/ui/switch';
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
import { usePlanFeatures } from '@/components/plan/use-plan-features';
import {
  listFieldsAction,
  saveFieldAction,
  setFieldArchivedAction,
} from '@/server/actions/custom-field-actions';

type FieldRow =
  Awaited<ReturnType<typeof listFieldsAction>> extends infer R
    ? R extends { ok: true; data: (infer D)[] }
      ? D
      : never
    : never;

/** Configurações → campos personalizados (administrador, Profissional em diante). */
export function CustomFieldsCard() {
  const { has, data: plan } = usePlanFeatures();
  const [entity, setEntity] = React.useState<CustomFieldEntity>('client');
  const [editing, setEditing] = React.useState<FieldRow | 'new' | null>(null);
  const queryClient = useQueryClient();
  const enabled = has('customFields');
  const { data: fields = [] } = useQuery({
    queryKey: ['custom-fields', entity, 'admin'],
    queryFn: () => listFieldsAction({ entity, includeArchived: true }).then(unwrapResult),
    enabled,
  });
  const archive = useMutation({
    mutationFn: (input: { id: string; archived: boolean }) =>
      setFieldArchivedAction(input).then(unwrapResult),
    onSuccess: (_r, input) =>
      toast.success(
        input.archived ? 'Campo arquivado (as respostas ficam guardadas).' : 'Campo restaurado.',
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['custom-fields'] }),
  });
  if (!plan || !enabled) return null;

  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">Campos personalizados</h2>
        <p className="text-label-secondary text-[13px]">
          Informações extras do seu negócio. Renomear não perde respostas; o tipo não muda depois de
          criado; arquivar esconde o campo sem apagar o que já foi preenchido.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          size="sm"
          value={entity}
          onValueChange={setEntity}
          options={CUSTOM_FIELD_ENTITIES.map((e) => ({ value: e, label: ENTITY_LABEL[e] }))}
        />
        <Button size="sm" onClick={() => setEditing('new')}>
          <PlusIcon /> Novo campo
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="text-label-secondary text-[13px]">
          Nenhum campo em {ENTITY_LABEL[entity].toLowerCase()} ainda.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {fields.map((f) => (
            <li
              key={f.id}
              className={`bg-background/60 flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] ${f.archived ? 'opacity-50' : ''}`}
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{f.label}</span>
                <span className="text-label-secondary block text-[12px]">
                  {TYPE_LABEL[f.type]}
                  {f.required && ' · obrigatório'}
                  {f.viewRole === 'admin'
                    ? ' · só administradores veem'
                    : f.editRole === 'admin'
                      ? ' · só administradores editam'
                      : ''}
                  {f.archived && ' · arquivado'}
                </span>
              </span>
              {!f.archived && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>
                  Editar
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={archive.isPending}
                onClick={() => archive.mutate({ id: f.id, archived: !f.archived })}
              >
                {f.archived ? 'Restaurar' : 'Arquivar'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <FieldDialog
          entity={entity}
          field={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
            queryClient.invalidateQueries({ queryKey: ['custom-field-values'] });
          }}
        />
      )}
    </section>
  );
}

function FieldDialog({
  entity,
  field,
  onClose,
}: {
  entity: CustomFieldEntity;
  field: FieldRow | null;
  onClose: () => void;
}) {
  const [form, setForm] = React.useState(() => ({
    label: field?.label ?? '',
    description: field?.description ?? '',
    type: (field?.type ?? 'short_text') as CustomFieldType,
    required: field?.required ?? false,
    options: (field?.options
      .filter((o) => !o.archived)
      .map((o) => ({ id: o.id, label: o.label })) ?? [{ label: '' }]) as {
      id?: string;
      label: string;
    }[],
    access: field
      ? field.viewRole === 'admin'
        ? 'admin_only'
        : field.editRole === 'admin'
          ? 'admin_edit'
          : 'all'
      : 'all',
  }));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      saveFieldAction({
        id: field?.id,
        entity,
        label: form.label,
        description: form.description || null,
        type: form.type,
        required: form.required,
        options: isSelect(form.type) ? form.options : undefined,
        viewRole: form.access === 'admin_only' ? 'admin' : 'all',
        editRole: form.access === 'all' ? 'all' : 'admin',
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Campo salvo.');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {field ? 'Editar campo' : `Novo campo em ${ENTITY_LABEL[entity].toLowerCase()}`}
          </DialogTitle>
          <DialogDescription>
            {field
              ? 'O tipo não muda depois de criado.'
              : 'Escolha bem o tipo: ele não muda depois.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input
            autoFocus
            placeholder="Nome do campo"
            maxLength={80}
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            aria-label="Nome do campo"
          />
          <Input
            placeholder="Descrição (opcional)"
            maxLength={300}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            aria-label="Descrição"
          />
          <Select
            value={form.type}
            disabled={!!field}
            onValueChange={(v: string) => set('type', v as CustomFieldType)}
          >
            <SelectTrigger className="w-full" aria-label="Tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CUSTOM_FIELD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSelect(form.type) && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-label-secondary mb-1 text-[12px]">
                Opções (remover arquiva a opção; respostas antigas continuam legíveis)
              </legend>
              {form.options.map((o, i) => (
                <div key={o.id ?? `n${i}`} className="flex gap-2">
                  <Input
                    value={o.label}
                    maxLength={80}
                    onChange={(e) =>
                      set(
                        'options',
                        form.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    aria-label={`Opção ${i + 1}`}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remover opção"
                    onClick={() =>
                      set(
                        'options',
                        form.options.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => set('options', [...form.options, { label: '' }])}
              >
                <PlusIcon /> Opção
              </Button>
            </fieldset>
          )}
          <label className="flex items-center justify-between gap-3 text-[14px]">
            Obrigatório
            <Switch
              checked={form.required}
              onCheckedChange={(v: boolean) => set('required', v)}
              aria-label="Obrigatório"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="text-label-secondary">Quem vê e edita</span>
            <Select value={form.access} onValueChange={(v: string) => set('access', v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda a equipe vê e edita</SelectItem>
                <SelectItem value="admin_edit">
                  Toda a equipe vê; só administradores editam
                </SelectItem>
                <SelectItem value="admin_only">Só administradores</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending || !form.label.trim()}>
              {save.isPending ? 'Salvando…' : 'Salvar campo'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
