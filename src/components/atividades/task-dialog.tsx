'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PlayIcon, PlusIcon, RotateCcwIcon, Trash2Icon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import {
  addTaskCommentAction,
  createTaskAction,
  getTaskDetailAction,
  listTeamAction,
  setTaskChecklistAction,
  setTaskStatusAction,
  toggleTaskChecklistAction,
  updateTaskAction,
} from '@/server/actions/task-actions';

export const PRIORITY_LABEL = {
  LOW: 'Baixa',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
} as const;
export const STATUS_LABEL = {
  OPEN: 'A fazer',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELED: 'Cancelada',
} as const;
const RECURRENCE_LABEL = {
  none: 'Não repete',
  daily: 'Todo dia',
  weekly: 'Toda semana',
  monthly: 'Todo mês',
};

type Priority = keyof typeof PRIORITY_LABEL;
type Links = {
  clientId?: string;
  opportunityId?: string;
  quoteId?: string;
  appointmentId?: string;
};

type Form = {
  title: string;
  details: string;
  dueDate: string;
  dueTime: string;
  remindDate: string;
  remindTime: string;
  assignedUserId: string;
  priority: Priority;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  checklist: { id?: string; text: string; done?: boolean }[];
};

const EMPTY: Form = {
  title: '',
  details: '',
  dueDate: '',
  dueTime: '',
  remindDate: '',
  remindTime: '',
  assignedUserId: '',
  priority: 'NORMAL',
  recurrence: 'none',
  checklist: [],
};

/** Partes da data no fuso da empresa (AAAA-MM-DD e HH:MM). */
function localParts(iso: string | null, timezone: string) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return { date, time: time === '23:59' ? '' : time };
}

const DRAFT_KEY = 'atendafy:task-draft';

/**
 * Criar ou abrir uma tarefa. Ao criar, o que foi digitado fica guardado no aparelho até salvar
 * (fechar sem querer não perde nada).
 */
export function TaskDialog({
  taskId,
  open,
  onOpenChange,
  timezone,
  links,
  defaultTitle,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
  links?: Links;
  defaultTitle?: string;
}) {
  return open ? (
    <TaskDialogInner
      taskId={taskId}
      onOpenChange={onOpenChange}
      timezone={timezone}
      links={links}
      defaultTitle={defaultTitle}
    />
  ) : null;
}

function TaskDialogInner({
  taskId,
  onOpenChange,
  timezone,
  links,
  defaultTitle,
}: {
  taskId: string | null;
  onOpenChange: (open: boolean) => void;
  timezone: string;
  links?: Links;
  defaultTitle?: string;
}) {
  const queryClient = useQueryClient();
  const { data: team } = useQuery({
    queryKey: ['team'],
    queryFn: () => listTeamAction().then(unwrapResult),
    staleTime: 5 * 60_000,
  });
  const { data: detail } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => getTaskDetailAction(taskId!).then(unwrapResult),
    enabled: !!taskId,
  });
  const [form, setForm] = React.useState<Form>(() => {
    if (taskId) return EMPTY;
    try {
      const saved = window.localStorage.getItem(DRAFT_KEY);
      if (saved && !links && !defaultTitle) return { ...EMPTY, ...(JSON.parse(saved) as Form) };
    } catch {
      // sem armazenamento local
    }
    return { ...EMPTY, title: defaultTitle ?? '' };
  });
  const [loadedId, setLoadedId] = React.useState<string | null>(null);
  if (detail && loadedId !== detail.id) {
    setLoadedId(detail.id);
    const due = localParts(detail.dueAt, timezone);
    const remind = localParts(detail.remindAt, timezone);
    setForm({
      title: detail.title,
      details: detail.details ?? '',
      dueDate: due.date,
      dueTime: due.time,
      remindDate: remind.date,
      remindTime: remind.time,
      assignedUserId: detail.assignedUserId ?? '',
      priority: detail.priority,
      recurrence: (detail.recurrence as Form['recurrence']) ?? 'none',
      checklist: detail.checklist,
    });
  }
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (!taskId) {
        try {
          window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
        } catch {
          // sem armazenamento local
        }
      }
      return next;
    });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    queryClient.invalidateQueries({ queryKey: ['my-day'] });
  };

  const payload = () => ({
    title: form.title,
    details: form.details || null,
    dueDate: form.dueDate || null,
    dueTime: form.dueTime || null,
    remindDate: form.remindDate || null,
    remindTime: form.remindTime || null,
    assignedUserId: form.assignedUserId || null,
    priority: form.priority,
    recurrence: form.recurrence === 'none' ? null : form.recurrence,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (taskId) {
        await updateTaskAction({ id: taskId, ...payload() }).then(unwrapResult);
        await setTaskChecklistAction({ id: taskId, items: form.checklist }).then(unwrapResult);
        return taskId;
      }
      return (
        await createTaskAction({ ...payload(), ...links, checklist: form.checklist }).then(
          unwrapResult,
        )
      ).id;
    },
    onSuccess: () => {
      if (!taskId) {
        try {
          window.localStorage.removeItem(DRAFT_KEY);
        } catch {
          // sem armazenamento local
        }
      }
      toast.success(taskId ? 'Tarefa atualizada.' : 'Tarefa criada.');
      refresh();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: (status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELED') =>
      setTaskStatusAction({ id: taskId, status }).then(unwrapResult),
    onSuccess: (r, status) => {
      toast.success(
        status === 'DONE'
          ? r.next
            ? 'Concluída. A próxima ocorrência já foi criada.'
            : 'Tarefa concluída.'
          : status === 'CANCELED'
            ? 'Tarefa cancelada.'
            : 'Status atualizado.',
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (input: { itemId: string; done: boolean }) =>
      toggleTaskChecklistAction({ id: taskId, ...input }).then(unwrapResult),
    onSettled: refresh,
  });
  const [comment, setComment] = React.useState('');
  const addComment = useMutation({
    mutationFn: () => addTaskCommentAction({ id: taskId, body: comment }).then(unwrapResult),
    onSuccess: () => {
      setComment('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closed = detail && (detail.status === 'DONE' || detail.status === 'CANCELED');
  const editable = !closed;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{taskId ? (detail?.title ?? 'Tarefa') : 'Nova tarefa'}</DialogTitle>
          <DialogDescription>
            {detail
              ? `${STATUS_LABEL[detail.status]}${detail.origin.startsWith('automation') ? ' · criada por rotina' : detail.origin === 'ai' ? ' · criada pelo assistente' : ''}`
              : 'Lembretes são internos: aparecem no sino de quem é responsável.'}
          </DialogDescription>
        </DialogHeader>

        {detail && (
          <div className="flex flex-wrap gap-2">
            {detail.status === 'OPEN' && (
              <Button
                size="sm"
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('IN_PROGRESS')}
              >
                <PlayIcon /> Começar
              </Button>
            )}
            {!closed && (
              <Button
                size="sm"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('DONE')}
              >
                <CheckIcon /> Concluir
              </Button>
            )}
            {!closed && (
              <Button
                size="sm"
                variant="ghost"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('CANCELED')}
              >
                <XIcon /> Cancelar tarefa
              </Button>
            )}
            {closed && (
              <Button
                size="sm"
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('OPEN')}
              >
                <RotateCcwIcon /> Reabrir
              </Button>
            )}
          </div>
        )}

        {detail &&
          (detail.client || detail.opportunity || detail.quote || detail.appointmentId) && (
            <div className="text-label-secondary flex flex-wrap gap-x-3 text-[13px]">
              {detail.client && (
                <Link
                  href={`/clientes/${detail.client.id}`}
                  className="text-system-blue hover:underline"
                >
                  Cliente: {detail.client.name}
                </Link>
              )}
              {detail.opportunity && (
                <Link
                  href={`/comercial?aba=oportunidades&oportunidade=${detail.opportunity.id}`}
                  className="text-system-blue hover:underline"
                >
                  Oportunidade: {detail.opportunity.title}
                </Link>
              )}
              {detail.quote && (
                <Link
                  href={`/comercial?aba=orcamentos&id=${detail.quote.id}`}
                  className="text-system-blue hover:underline"
                >
                  Orçamento #{detail.quote.number}
                </Link>
              )}
              {detail.appointmentId && (
                <Link
                  href={`/agenda/atendimento/${detail.appointmentId}`}
                  className="text-system-blue hover:underline"
                >
                  Atendimento
                </Link>
              )}
            </div>
          )}

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input
            autoFocus={!taskId}
            placeholder="O que precisa ser feito?"
            maxLength={160}
            value={form.title}
            disabled={!editable}
            onChange={(e) => set('title', e.target.value)}
            aria-label="Título"
          />
          <Textarea
            rows={2}
            maxLength={4000}
            placeholder="Descrição (opcional)"
            value={form.details}
            disabled={!editable}
            onChange={(e) => set('details', e.target.value)}
            aria-label="Descrição"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-label-secondary">Responsável</span>
              <Select
                value={form.assignedUserId || 'none'}
                disabled={!editable}
                onValueChange={(v: string) => set('assignedUserId', v === 'none' ? '' : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {team?.members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.userId === team.me ? `${m.name} (você)` : m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-label-secondary">Prioridade</span>
              <Select
                value={form.priority}
                disabled={!editable}
                onValueChange={(v: string) => set('priority', v as Priority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-label-secondary">Prazo</span>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={form.dueDate}
                  disabled={!editable}
                  onChange={(e) => set('dueDate', e.target.value)}
                  aria-label="Data do prazo"
                />
                <Input
                  type="time"
                  className="w-28"
                  value={form.dueTime}
                  disabled={!editable || !form.dueDate}
                  onChange={(e) => set('dueTime', e.target.value)}
                  aria-label="Hora do prazo"
                />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-label-secondary">Lembrete (no sino)</span>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={form.remindDate}
                  disabled={!editable}
                  onChange={(e) => set('remindDate', e.target.value)}
                  aria-label="Data do lembrete"
                />
                <Input
                  type="time"
                  className="w-28"
                  value={form.remindTime}
                  disabled={!editable || !form.remindDate}
                  onChange={(e) => set('remindTime', e.target.value)}
                  aria-label="Hora do lembrete"
                />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-[12px] sm:col-span-2">
              <span className="text-label-secondary">Repetição</span>
              <Select
                value={form.recurrence}
                disabled={!editable}
                onValueChange={(v: string) => set('recurrence', v as Form['recurrence'])}
              >
                <SelectTrigger className="w-full sm:w-60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RECURRENCE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.recurrence !== 'none' && (
                <span className="text-label-secondary">
                  A próxima nasce quando esta for concluída ou cancelada
                  {form.dueDate ? '' : ' (defina o prazo)'}.
                </span>
              )}
            </label>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-label-secondary mb-1 text-[12px]">Checklist (opcional)</legend>
            {form.checklist.map((item, i) => (
              <div key={item.id ?? `new-${i}`} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={!!item.done}
                  disabled={!editable}
                  aria-label={`Feito: ${item.text}`}
                  onChange={(e) => {
                    const done = e.target.checked;
                    set(
                      'checklist',
                      form.checklist.map((c, j) => (j === i ? { ...c, done } : c)),
                    );
                    if (taskId && item.id) toggle.mutate({ itemId: item.id, done });
                  }}
                />
                <Input
                  className={cn('flex-1', item.done && 'text-label-secondary line-through')}
                  value={item.text}
                  maxLength={200}
                  disabled={!editable}
                  onChange={(e) =>
                    set(
                      'checklist',
                      form.checklist.map((c, j) => (j === i ? { ...c, text: e.target.value } : c)),
                    )
                  }
                  aria-label={`Item ${i + 1}`}
                />
                {editable && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remover item"
                    onClick={() =>
                      set(
                        'checklist',
                        form.checklist.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            ))}
            {editable && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start"
                disabled={form.checklist.length >= 30}
                onClick={() => set('checklist', [...form.checklist, { text: '' }])}
              >
                <PlusIcon /> Item
              </Button>
            )}
          </fieldset>

          {editable && (
            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending || !form.title.trim()}>
                {save.isPending ? 'Salvando…' : taskId ? 'Salvar alterações' : 'Criar tarefa'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          )}
        </form>

        {detail && (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="text-[14px] font-semibold">Comentários</h3>
              {detail.comments.length === 0 && (
                <p className="text-label-secondary text-[13px]">Nenhum comentário.</p>
              )}
              {detail.comments.map((c) => (
                <div key={c.id} className="bg-foreground/[0.04] rounded-xl px-3 py-2 text-[13px]">
                  <div className="text-label-secondary text-[11px]">
                    {c.author} ·{' '}
                    {new Intl.DateTimeFormat('pt-BR', {
                      timeZone: timezone,
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(c.createdAt))}
                  </div>
                  <div className="whitespace-pre-line">{c.body}</div>
                </div>
              ))}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (comment.trim()) addComment.mutate();
                }}
              >
                <Input
                  placeholder="Escrever um comentário"
                  maxLength={2000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  aria-label="Comentário"
                />
                <Button type="submit" size="sm" disabled={!comment.trim() || addComment.isPending}>
                  Enviar
                </Button>
              </form>
            </section>
            <details className="text-[13px]">
              <summary className="text-label-secondary cursor-pointer">
                Histórico ({detail.history.length})
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {detail.history.map((h) => (
                  <li key={h.id}>
                    <span className="text-label-secondary">
                      {new Intl.DateTimeFormat('pt-BR', {
                        timeZone: timezone,
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(h.at))}
                    </span>{' '}
                    {h.text}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
