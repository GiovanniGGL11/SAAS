'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listTeamAction } from '@/server/actions/task-actions';
import {
  listRulesAction,
  previewRuleAction,
  runRuleNowAction,
  saveRuleAction,
  setRuleActiveAction,
} from '@/server/actions/rule-actions';

const TRIGGERS = {
  quote_no_response: { label: 'Orçamento sem resposta', param: 'Dias desde o envio', days: 5 },
  appointment_done: {
    label: 'Atendimento concluído → pedir avaliação',
    param: 'Horas depois',
    days: 2,
  },
  bill_due_soon: { label: 'Conta próxima do vencimento', param: 'Dias antes', days: 3 },
  job_overdue: { label: 'Serviço em andamento atrasado', param: 'Dias de atraso', days: 0 },
  opportunity_stale: { label: 'Oportunidade parada', param: 'Dias sem mudar de etapa', days: 7 },
} as const;
type Trigger = keyof typeof TRIGGERS;

/** Automações configuráveis (Pro): regras simples, sem IA, com prévia e histórico. */
export function RulesSection() {
  const queryClient = useQueryClient();
  const { data: rules = [] } = useQuery({
    queryKey: ['rules'],
    queryFn: () => listRulesAction().then(unwrapResult),
  });
  const { data: team } = useQuery({
    queryKey: ['team'],
    queryFn: () => listTeamAction().then(unwrapResult),
    staleTime: 300_000,
  });
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    trigger: 'quote_no_response' as Trigger,
    days: '5',
    action: 'create_task',
    assigneeUserId: '',
    maxPerDay: '10',
  });
  const [preview, setPreview] = React.useState<{ title: string; alreadyHandled: boolean }[] | null>(
    null,
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['rules'] });
  const payload = () => ({
    name: form.name || TRIGGERS[form.trigger].label,
    trigger: form.trigger,
    days: Number(form.days) || 0,
    action: form.action,
    assigneeUserId: form.assigneeUserId || null,
    maxPerDay: Number(form.maxPerDay) || 10,
  });
  const save = useMutation({
    mutationFn: () => saveRuleAction(payload()).then(unwrapResult),
    onSuccess: () => {
      toast.success('Regra criada e ativa.');
      setAdding(false);
      setPreview(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const previewMut = useMutation({
    mutationFn: () => previewRuleAction(payload()).then(unwrapResult),
    onSuccess: setPreview,
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setRuleActiveAction(input).then(unwrapResult),
    onSettled: refresh,
  });
  const runNow = useMutation({
    mutationFn: (id: string) => runRuleNowAction(id).then(unwrapResult),
    onSuccess: (r) =>
      r.status === 'SKIPPED'
        ? toast.warning(`Não executada: ${'reason' in r ? r.reason : ''}`)
        : toast.success(`Executada: ${'stats' in r ? r.stats.created : 0} tarefa(s) nova(s).`),
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });

  return (
    <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold">Regras automáticas</h2>
          <p className="text-label-secondary text-[13px]">
            Sem IA: quando algo acontece, o sistema cria a tarefa ou avisa o responsável. Nunca
            repete o mesmo item, respeita o limite diário e, ao reativar, só considera o que é
            recente.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <PlusIcon /> Nova regra
        </Button>
      </div>
      {adding && (
        <form
          className="bg-background/60 flex flex-col gap-2 rounded-2xl p-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input
            placeholder="Nome (opcional)"
            maxLength={80}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={form.trigger}
              onValueChange={(v: string) =>
                setForm((f) => ({
                  ...f,
                  trigger: v as Trigger,
                  days: String(TRIGGERS[v as Trigger].days),
                }))
              }
            >
              <SelectTrigger aria-label="Quando">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGERS).map(([k, t]) => (
                  <SelectItem key={k} value={k}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-[13px]">
              <span className="text-label-secondary shrink-0">{TRIGGERS[form.trigger].param}</span>
              <Input
                type="number"
                min={0}
                max={90}
                value={form.days}
                onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
              />
            </label>
            <Select
              value={form.action}
              onValueChange={(v: string) => setForm((f) => ({ ...f, action: v }))}
            >
              <SelectTrigger aria-label="Ação">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create_task">Criar tarefa</SelectItem>
                <SelectItem value="notify">Avisar o responsável no sino</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={form.assigneeUserId || 'none'}
              onValueChange={(v: string) =>
                setForm((f) => ({ ...f, assigneeUserId: v === 'none' ? '' : v }))
              }
            >
              <SelectTrigger aria-label="Responsável">
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
            <label className="flex items-center gap-2 text-[13px]">
              <span className="text-label-secondary shrink-0">Máximo por dia</span>
              <Input
                type="number"
                min={1}
                max={50}
                value={form.maxPerDay}
                onChange={(e) => setForm((f) => ({ ...f, maxPerDay: e.target.value }))}
              />
            </label>
          </div>
          {preview && (
            <div className="text-[13px]">
              <div className="font-medium">Prévia: {preview.length} item(ns) agora</div>
              <ul className="text-label-secondary">
                {preview.slice(0, 8).map((p, i) => (
                  <li key={i}>• {p.title}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={previewMut.isPending}
              onClick={() => previewMut.mutate()}
            >
              Ver prévia
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              Salvar e ativar
            </Button>
          </div>
        </form>
      )}
      {rules.length === 0 ? (
        <p className="text-label-secondary text-[13px]">Nenhuma regra ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((r) => (
            <li
              key={r.id}
              className="bg-background/60 flex flex-col gap-1 rounded-xl px-3 py-2 text-[14px]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.name}</span>
                <Badge variant={r.active ? 'default' : 'outline'}>
                  {r.active ? 'Ativa' : 'Pausada'}
                </Badge>
              </div>
              <div className="text-label-secondary text-[12px]">
                {TRIGGERS[r.trigger as Trigger]?.label} (
                {TRIGGERS[r.trigger as Trigger]?.param.toLowerCase()}: {r.days}) · até {r.maxPerDay}
                /dia
                {r.lastRunAt &&
                  ` · última execução ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(r.lastRunAt))}`}
              </div>
              {r.runs[0] && (
                <div className="text-label-secondary text-[12px]">
                  Última:{' '}
                  {r.runs[0].status === 'SKIPPED'
                    ? `pulada (${r.runs[0].note})`
                    : `${r.runs[0].stats.created ?? 0} criada(s), ${r.runs[0].stats.alreadyHandled ?? 0} já tratada(s)`}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ id: r.id, active: !r.active })}
                >
                  {r.active ? 'Pausar' : 'Reativar'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={runNow.isPending || !r.active}
                  onClick={() => runNow.mutate(r.id)}
                >
                  Executar agora
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
