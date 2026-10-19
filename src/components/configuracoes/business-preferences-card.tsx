'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { WEEKDAY_SHORT } from '@/lib/waitlist';
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
import { getPreferencesAction, savePreferencesAction } from '@/server/actions/preferences-actions';

type Prefs =
  Awaited<ReturnType<typeof getPreferencesAction>> extends infer R
    ? R extends { ok: true; data: infer D }
      ? D
      : never
    : never;

const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTime = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Preferências do negócio, em três blocos que não se misturam: linguagem (só orienta o texto da
 * IA), regras aplicadas pelo sistema e avisos. Permissões continuam em Equipe/Fichas.
 */
export function BusinessPreferencesCard() {
  const { data } = useQuery({
    queryKey: ['business-preferences'],
    queryFn: () => getPreferencesAction().then(unwrapResult),
  });
  if (!data) return null;
  return <PreferencesForm initial={data} />;
}

function PreferencesForm({ initial }: { initial: Prefs }) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState(() => ({
    tone: initial.tone as 'cordial' | 'formal' | 'descontraido',
    languageNotes: initial.languageNotes ?? '',
    escalationNotes: initial.escalationNotes ?? '',
    escalateOnComplaint: initial.escalateOnComplaint,
    escalateOnHealth: initial.escalateOnHealth,
    contactStart: toTime(initial.contactStartMinutes),
    contactEnd: toTime(initial.contactEndMinutes),
    contactWeekdays: initial.contactWeekdays,
    maxDiscountPercent:
      initial.maxDiscountPercent == null ? '' : String(initial.maxDiscountPercent),
    dailySummaryAuto: initial.dailySummaryAuto,
    dailySummaryHour: String(initial.dailySummaryHour),
    notifyQuotes: initial.notifyQuotes,
    notifyTasks: initial.notifyTasks,
    notifyApprovals: initial.notifyApprovals,
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      savePreferencesAction({
        tone: form.tone,
        languageNotes: form.languageNotes || null,
        escalationNotes: form.escalationNotes || null,
        escalateOnComplaint: form.escalateOnComplaint,
        escalateOnHealth: form.escalateOnHealth,
        contactStartMinutes: fromTime(form.contactStart),
        contactEndMinutes: fromTime(form.contactEnd),
        contactWeekdays: form.contactWeekdays,
        maxDiscountPercent: form.maxDiscountPercent === '' ? null : Number(form.maxDiscountPercent),
        approvalAboveCents: initial.approvalAboveCents,
        autoSpendLimitUnits: initial.autoSpendLimitUnits,
        dailySummaryAuto: form.dailySummaryAuto,
        dailySummaryHour: Number(form.dailySummaryHour),
        notifyQuotes: form.notifyQuotes,
        notifyTasks: form.notifyTasks,
        notifyApprovals: form.notifyApprovals,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Preferências salvas.');
      queryClient.invalidateQueries({ queryKey: ['business-preferences'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="bg-tile flex flex-col gap-5 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">Preferências do negócio</h2>
        <p className="text-label-secondary text-[13px]">
          Como o sistema e a IA se comportam no seu negócio. Quem pode ver e fazer o quê continua
          nas permissões da equipe.{' '}
          <Link href="/dashboard/aprovacoes" className="text-system-blue hover:underline">
            Central de aprovações
          </Link>{' '}
          ·{' '}
          <Link href="/dashboard/automacoes" className="text-system-blue hover:underline">
            Ações automáticas
          </Link>
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[14px] font-semibold">Linguagem da IA</legend>
        <p className="text-label-secondary -mt-1 text-[12px]">
          Só orienta o jeito de escrever. Nada escrito aqui libera ações ou muda regras.
        </p>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-label-secondary">Tom</span>
          <Select
            value={form.tone}
            onValueChange={(v: string) => set('tone', v as typeof form.tone)}
          >
            <SelectTrigger className="w-full sm:w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cordial">Cordial</SelectItem>
              <SelectItem value="formal">Formal</SelectItem>
              <SelectItem value="descontraido">Descontraído</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <Textarea
          rows={2}
          maxLength={600}
          placeholder="Observações de linguagem (ex.: chamar clientes pelo primeiro nome)"
          value={form.languageNotes}
          onChange={(e) => set('languageNotes', e.target.value)}
          aria-label="Observações de linguagem"
        />
        <Toggle
          label="Reclamação: sugerir que uma pessoa da equipe assuma"
          checked={form.escalateOnComplaint}
          onChange={(v) => set('escalateOnComplaint', v)}
        />
        <Toggle
          label="Assunto de saúde ou reação: não orientar, chamar uma pessoa"
          checked={form.escalateOnHealth}
          onChange={(v) => set('escalateOnHealth', v)}
        />
        <Textarea
          rows={2}
          maxLength={600}
          placeholder="Outros casos para chamar uma pessoa (opcional)"
          value={form.escalationNotes}
          onChange={(e) => set('escalationNotes', e.target.value)}
          aria-label="Outros casos para chamar uma pessoa"
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[14px] font-semibold">Regras aplicadas pelo sistema</legend>
        <div className="flex flex-col gap-1.5 text-[13px]">
          <span className="text-label-secondary">
            Horário para contato automático com clientes (mensagens de rotinas só nesta janela)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="time"
              className="w-32"
              value={form.contactStart}
              onChange={(e) => set('contactStart', e.target.value)}
              aria-label="Início do contato"
            />
            <span>às</span>
            <Input
              type="time"
              className="w-32"
              value={form.contactEnd}
              onChange={(e) => set('contactEnd', e.target.value)}
              aria-label="Fim do contato"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_SHORT.map((label, index) => {
              const active = form.contactWeekdays.includes(index);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    set(
                      'contactWeekdays',
                      active
                        ? form.contactWeekdays.filter((d) => d !== index)
                        : [...form.contactWeekdays, index],
                    )
                  }
                  className={cn(
                    'rounded-full px-3 py-1 text-[13px] font-medium',
                    active
                      ? 'bg-system-blue text-white'
                      : 'bg-foreground/[0.06] text-label-secondary',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-label-secondary">Desconto máximo em orçamentos (%)</span>
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="Sem limite"
              value={form.maxDiscountPercent}
              onChange={(e) => set('maxDiscountPercent', e.target.value)}
            />
          </label>
        </div>
        {initial.plan.dailySummaryAuto && (
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <Toggle
              label="Gerar o resumo do dia sozinho às"
              checked={form.dailySummaryAuto}
              onChange={(v) => set('dailySummaryAuto', v)}
            />
            <Input
              type="number"
              min={0}
              max={23}
              className="w-20"
              value={form.dailySummaryHour}
              onChange={(e) => set('dailySummaryHour', e.target.value)}
              aria-label="Hora do resumo"
            />
            <span className="text-label-secondary">h</span>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[14px] font-semibold">Avisos no sino</legend>
        <Toggle
          label="Orçamentos aguardando resposta"
          checked={form.notifyQuotes}
          onChange={(v) => set('notifyQuotes', v)}
        />
        <Toggle
          label="Tarefas vencendo"
          checked={form.notifyTasks}
          onChange={(v) => set('notifyTasks', v)}
        />
        <Toggle
          label="Propostas da IA aguardando aprovação"
          checked={form.notifyApprovals}
          onChange={(v) => set('notifyApprovals', v)}
        />
      </fieldset>

      <Button className="self-start" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Salvando…' : 'Salvar preferências'}
      </Button>
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[14px]">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
