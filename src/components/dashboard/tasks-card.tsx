'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PlusIcon, RepeatIcon, SparklesIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createTaskAction,
  listTasksAction,
  setTaskStatusAction,
} from '@/server/actions/task-actions';

function dueLabel(iso: string | null) {
  if (!iso) return null;
  const due = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(due);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { text: 'atrasada', late: true };
  if (diff === 0) return { text: 'hoje', late: false };
  if (diff === 1) return { text: 'amanhã', late: false };
  return {
    text: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(due),
    late: false,
  };
}

/** Tarefas de acompanhamento abertas (manuais, do assistente ou de rotinas). */
export function TasksCard() {
  const queryClient = useQueryClient();
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', 'OPEN'],
    queryFn: () => listTasksAction({ status: 'OPEN' }).then(unwrapResult),
  });
  const [title, setTitle] = React.useState('');
  const [due, setDue] = React.useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tasks'] });

  const add = useMutation({
    mutationFn: () =>
      createTaskAction({
        title,
        dueAt: due ? new Date(`${due}T12:00:00`) : null,
      }).then(unwrapResult),
    onSuccess: () => {
      setTitle('');
      setDue('');
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });
  const set = useMutation({
    mutationFn: (input: { id: string; status: 'DONE' | 'CANCELED' }) =>
      setTaskStatusAction(input).then(unwrapResult),
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });

  return (
    <section id="tarefas" className="bg-tile flex flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">Tarefas</h2>
        <span className="text-label-secondary text-[13px] tabular-nums">
          {tasks.length} abertas
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className="text-label-secondary text-[13px]">
          Nenhuma tarefa aberta. Retornos de orçamento e renovações de pacote aparecem aqui.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tasks.slice(0, 12).map((task) => {
            const due = dueLabel(task.dueAt);
            return (
              <li
                key={task.id}
                className="bg-background/60 flex items-start gap-2 rounded-2xl px-3 py-2 text-[14px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {task.origin.startsWith('automation') && (
                      <RepeatIcon
                        className="text-label-secondary size-3.5 shrink-0"
                        aria-label="Criada por rotina"
                      />
                    )}
                    {task.origin === 'ai' && (
                      <SparklesIcon
                        className="text-label-secondary size-3.5 shrink-0"
                        aria-label="Criada pelo assistente"
                      />
                    )}
                    <span className="font-medium break-words">{task.title}</span>
                  </div>
                  <div className="text-label-secondary flex flex-wrap gap-x-2 text-[12px]">
                    {due && <span className={due.late ? 'text-system-red' : ''}>{due.text}</span>}
                    {task.client && (
                      <Link href={`/clientes/${task.client.id}`} className="hover:underline">
                        {task.client.name}
                      </Link>
                    )}
                    {task.quote && (
                      <Link
                        href={`/comercial?aba=orcamentos&id=${task.quote.id}`}
                        className="hover:underline"
                      >
                        Orçamento #{task.quote.number}
                      </Link>
                    )}
                  </div>
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Concluir tarefa"
                  disabled={set.isPending}
                  onClick={() => set.mutate({ id: task.id, status: 'DONE' })}
                >
                  <CheckIcon />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Descartar tarefa"
                  disabled={set.isPending}
                  onClick={() => set.mutate({ id: task.id, status: 'CANCELED' })}
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) add.mutate();
        }}
      >
        <Input
          className="min-w-0 flex-1"
          placeholder="Nova tarefa"
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Nova tarefa"
        />
        <Input
          type="date"
          className="w-40"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Prazo"
        />
        <Button type="submit" size="sm" disabled={!title.trim() || add.isPending}>
          <PlusIcon /> Adicionar
        </Button>
      </form>
    </section>
  );
}
