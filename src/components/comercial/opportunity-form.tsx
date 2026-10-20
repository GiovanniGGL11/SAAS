'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listClientsAction } from '@/server/actions/client-actions';
import { listServicesAction } from '@/server/actions/service-actions';
import { listTeamAction } from '@/server/actions/task-actions';
import { createOpportunityAction, updateOpportunityAction } from '@/server/actions/crm-actions';

type Initial = {
  id: string;
  title: string;
  client: { id: string; name: string } | null;
  contactName: string | null;
  contactPhone: string | null;
  source: string | null;
  ownerUserId: string | null;
  services: { id: string }[];
  estimatedValue: number | null;
  nextAction: string | null;
  nextActionAt: string | null;
  expectedCloseAt: string | null;
};

const SOURCES = [
  'Indicação',
  'Instagram',
  'Site',
  'WhatsApp',
  'Telefone',
  'Passou na frente',
  'Outro',
];

function localDay(iso: string | null, timezone: string) {
  return iso ? new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(iso)) : '';
}

/** Criar/editar oportunidade: cliente cadastrado ou só o contato (sem duplicar cliente). */
export function OpportunityForm({
  timezone,
  initial,
  onDone,
}: {
  timezone: string;
  initial?: Initial;
  onDone: (id?: string) => void;
}) {
  const [mode, setMode] = React.useState<'client' | 'contact'>(
    initial && !initial.client ? 'contact' : 'client',
  );
  const [form, setForm] = React.useState(() => ({
    title: initial?.title ?? '',
    clientId: initial?.client?.id ?? '',
    contactName: initial?.contactName ?? '',
    contactPhone: initial?.contactPhone ?? '',
    source: initial?.source ?? '',
    ownerUserId: initial?.ownerUserId ?? '',
    serviceId: initial?.services[0]?.id ?? '',
    estimatedValue: initial?.estimatedValue == null ? '' : String(initial.estimatedValue),
    nextAction: initial?.nextAction ?? '',
    nextActionDate: localDay(initial?.nextActionAt ?? null, timezone),
    expectedCloseDate: localDay(initial?.expectedCloseAt ?? null, timezone),
  }));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: listClientsAction });
  const { data: services = [] } = useQuery({ queryKey: ['services'], queryFn: listServicesAction });
  const { data: team } = useQuery({
    queryKey: ['team'],
    queryFn: () => listTeamAction().then(unwrapResult),
    staleTime: 300_000,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        clientId: mode === 'client' ? form.clientId || null : null,
        contactName: mode === 'contact' ? form.contactName || null : null,
        contactPhone: mode === 'contact' ? form.contactPhone || null : null,
        source: form.source || null,
        ownerUserId: form.ownerUserId || null,
        serviceIds: form.serviceId ? [form.serviceId] : [],
        estimatedValue:
          form.estimatedValue === '' ? null : Number(form.estimatedValue.replace(',', '.')),
        nextAction: form.nextAction || null,
        nextActionDate: form.nextActionDate || null,
        expectedCloseDate: form.expectedCloseDate || null,
      };
      if (initial) {
        await updateOpportunityAction({ id: initial.id, ...payload }).then(unwrapResult);
        return initial.id;
      }
      return (await createOpportunityAction(payload).then(unwrapResult)).id;
    },
    onSuccess: (id) => {
      toast.success(initial ? 'Oportunidade atualizada.' : 'Oportunidade criada.');
      onDone(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clientOptions: ComboboxOption[] = clients
    .filter((c) => c.active)
    .map((c) => ({ value: c.id, label: c.name, description: c.phone ?? undefined }));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Input
        autoFocus
        placeholder="Título (ex.: Reforma da cozinha, Plano anual)"
        maxLength={160}
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        aria-label="Título"
      />
      <SegmentedControl
        size="sm"
        value={mode}
        onValueChange={setMode}
        options={[
          { value: 'client', label: 'Cliente cadastrado' },
          { value: 'contact', label: 'Contato novo' },
        ]}
      />
      {mode === 'client' ? (
        <Combobox
          options={clientOptions}
          value={form.clientId}
          onChange={(v) => set('clientId', v)}
          placeholder="Cliente"
          searchPlaceholder="Buscar cliente…"
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Nome do contato"
            maxLength={120}
            value={form.contactName}
            onChange={(e) => set('contactName', e.target.value)}
            aria-label="Nome do contato"
          />
          <Input
            placeholder="Telefone"
            inputMode="tel"
            maxLength={30}
            value={form.contactPhone}
            onChange={(e) => set('contactPhone', e.target.value)}
            aria-label="Telefone do contato"
          />
          <p className="text-label-secondary text-[12px] sm:col-span-2">
            Se o telefone já for de um cliente, a oportunidade é ligada a ele (sem cadastro
            duplicado).
          </p>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-label-secondary">Responsável</span>
          <Select
            value={form.ownerUserId || 'none'}
            onValueChange={(v: string) => set('ownerUserId', v === 'none' ? '' : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem responsável</SelectItem>
              {team?.members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-label-secondary">Origem</span>
          <Select
            value={form.source || 'none'}
            onValueChange={(v: string) => set('source', v === 'none' ? '' : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Não informada</SelectItem>
              {SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-label-secondary">Serviço de interesse</span>
          <Select
            value={form.serviceId || 'none'}
            onValueChange={(v: string) => set('serviceId', v === 'none' ? '' : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {services
                .filter((s) => s.active)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-label-secondary">Valor estimado (R$) — não é receita</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={form.estimatedValue}
            onChange={(e) => set('estimatedValue', e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-label-secondary">Próxima ação</span>
          <Input
            maxLength={200}
            placeholder="Ex.: ligar para fechar"
            value={form.nextAction}
            onChange={(e) => set('nextAction', e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-label-secondary">Quando</span>
          <Input
            type="date"
            value={form.nextActionDate}
            onChange={(e) => set('nextActionDate', e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-label-secondary">Previsão de fechamento</span>
          <Input
            type="date"
            value={form.expectedCloseDate}
            onChange={(e) => set('expectedCloseDate', e.target.value)}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending || !form.title.trim()}>
          {save.isPending ? 'Salvando…' : initial ? 'Salvar' : 'Criar oportunidade'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
