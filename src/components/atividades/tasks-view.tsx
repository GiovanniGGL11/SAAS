'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckIcon,
  ListChecksIcon,
  MessageSquareIcon,
  PlusIcon,
  RepeatIcon,
  SparklesIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PRIORITY_LABEL, TaskDialog } from '@/components/atividades/task-dialog';
import {
  listTasksAction,
  listTeamAction,
  setTaskStatusAction,
  type TaskListItem,
} from '@/server/actions/task-actions';

type StatusFilter = 'ACTIVE' | 'DONE' | 'CANCELED';
type DueFilter = 'all' | 'overdue' | 'today' | 'future' | 'none';

const PRIORITY_TONE = {
  LOW: 'text-label-secondary',
  NORMAL: 'text-label-secondary',
  HIGH: 'text-system-orange',
  URGENT: 'text-system-red',
} as const;

function dayKey(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(iso));
}

/** Tarefas: lista com filtros, agrupada por atrasadas, hoje, próximas e sem prazo. */
export function TasksView({
  timezone,
  initialTaskId,
}: {
  timezone: string;
  initialTaskId?: string;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState<StatusFilter>('ACTIVE');
  const [assignee, setAssignee] = React.useState('me');
  const [due, setDue] = React.useState<DueFilter>('all');
  const [priority, setPriority] = React.useState<'all' | keyof typeof PRIORITY_LABEL>('all');
  const [search, setSearch] = React.useState('');
  const [openTask, setOpenTask] = React.useState<string | null>(initialTaskId ?? null);
  const [creating, setCreating] = React.useState(false);

  const { data: team } = useQuery({
    queryKey: ['team'],
    queryFn: () => listTeamAction().then(unwrapResult),
    staleTime: 5 * 60_000,
  });
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'view', status, assignee, due, priority, search],
    queryFn: () =>
      listTasksAction({
        status,
        assignee: assignee === 'all' ? undefined : assignee,
        due: due === 'all' ? undefined : due,
        priority: priority === 'all' ? undefined : priority,
        search: search.trim() || undefined,
      }).then(unwrapResult),
  });
  const complete = useMutation({
    mutationFn: (id: string) => setTaskStatusAction({ id, status: 'DONE' }).then(unwrapResult),
    onSuccess: (r) =>
      toast.success(r.next ? 'Concluída. Próxima ocorrência criada.' : 'Tarefa concluída.'),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-day'] });
    },
  });

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const groups =
    status === 'ACTIVE'
      ? [
          {
            key: 'overdue',
            title: 'Atrasadas',
            items: tasks.filter((t) => t.dueAt && dayKey(t.dueAt, timezone) < today),
          },
          {
            key: 'today',
            title: 'Hoje',
            items: tasks.filter((t) => t.dueAt && dayKey(t.dueAt, timezone) === today),
          },
          {
            key: 'future',
            title: 'Próximas',
            items: tasks.filter((t) => t.dueAt && dayKey(t.dueAt, timezone) > today),
          },
          { key: 'none', title: 'Sem prazo', items: tasks.filter((t) => !t.dueAt) },
        ]
      : [{ key: 'all', title: '', items: tasks }];
  const nameOf = (uid: string | null) =>
    uid
      ? uid === team?.me
        ? 'Você'
        : (team?.members.find((m) => m.userId === uid)?.name ?? 'Equipe')
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          size="sm"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: 'ACTIVE', label: 'Abertas' },
            { value: 'DONE', label: 'Concluídas' },
            { value: 'CANCELED', label: 'Canceladas' },
          ]}
        />
        <Button onClick={() => setCreating(true)}>
          <PlusIcon className="size-4" /> Nova tarefa
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-44" aria-label="Responsável">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="me">Minhas</SelectItem>
            <SelectItem value="all">De todos</SelectItem>
            <SelectItem value="none">Sem responsável</SelectItem>
            {team?.members
              .filter((m) => m.userId !== team.me)
              .map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {status === 'ACTIVE' && (
          <Select value={due} onValueChange={(v: string) => setDue(v as DueFilter)}>
            <SelectTrigger className="w-40" aria-label="Prazo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Qualquer prazo</SelectItem>
              <SelectItem value="overdue">Atrasadas</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="future">Próximas</SelectItem>
              <SelectItem value="none">Sem prazo</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={priority} onValueChange={(v: string) => setPriority(v as typeof priority)}>
          <SelectTrigger className="w-40" aria-label="Prioridade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer prioridade</SelectItem>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-full sm:w-56"
          placeholder="Buscar pelo título"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar tarefa"
        />
      </div>

      {!isLoading && tasks.length === 0 ? (
        <EmptyState
          icon={ListChecksIcon}
          title="Nenhuma tarefa aqui"
          description="Crie tarefas para retornos, cobranças, preparos e lembretes da equipe. Elas também nascem de orçamentos, oportunidades e rotinas."
        />
      ) : (
        groups
          .filter((g) => g.items.length > 0)
          .map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              {group.title && (
                <h2
                  className={cn(
                    'text-[13px] font-semibold uppercase',
                    group.key === 'overdue' ? 'text-system-red' : 'text-label-secondary',
                  )}
                >
                  {group.title} · {group.items.length}
                </h2>
              )}
              <ul className="flex flex-col gap-1.5">
                {group.items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    timezone={timezone}
                    assignee={nameOf(task.assignedUserId)}
                    onOpen={() => setOpenTask(task.id)}
                    onComplete={() => complete.mutate(task.id)}
                    busy={complete.isPending}
                  />
                ))}
              </ul>
            </section>
          ))
      )}

      <TaskDialog
        taskId={openTask}
        open={!!openTask}
        onOpenChange={(o) => !o && setOpenTask(null)}
        timezone={timezone}
      />
      <TaskDialog taskId={null} open={creating} onOpenChange={setCreating} timezone={timezone} />
    </div>
  );
}

function TaskRow({
  task,
  timezone,
  assignee,
  onOpen,
  onComplete,
  busy,
}: {
  task: TaskListItem;
  timezone: string;
  assignee: string | null;
  onOpen: () => void;
  onComplete: () => void;
  busy: boolean;
}) {
  const active = task.status === 'OPEN' || task.status === 'IN_PROGRESS';
  const checklistDone = task.checklist.filter((c) => c.done).length;
  return (
    <li className="bg-tile flex items-start gap-2 rounded-2xl px-3 py-2.5">
      {active ? (
        <button
          type="button"
          onClick={onComplete}
          disabled={busy}
          aria-label={`Concluir ${task.title}`}
          className="border-foreground/25 hover:border-system-green hover:text-system-green mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border"
        >
          <CheckIcon className="size-3 opacity-0 hover:opacity-100" />
        </button>
      ) : (
        <span
          className={cn(
            'mt-0.5 size-5 shrink-0 rounded-full',
            task.status === 'DONE' ? 'bg-system-green/20' : 'bg-foreground/10',
          )}
        />
      )}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-medium">
          {task.origin.startsWith('automation') && (
            <RepeatIcon className="text-label-secondary size-3.5" aria-label="Criada por rotina" />
          )}
          {task.origin === 'ai' && (
            <SparklesIcon
              className="text-label-secondary size-3.5"
              aria-label="Criada pelo assistente"
            />
          )}
          <span className={cn(!active && 'text-label-secondary line-through')}>{task.title}</span>
          {task.status === 'IN_PROGRESS' && (
            <span className="bg-system-blue/10 text-system-blue rounded-full px-2 py-0.5 text-[11px]">
              Em andamento
            </span>
          )}
        </div>
        <div className="text-label-secondary flex flex-wrap gap-x-2 text-[12px]">
          {task.dueAt && (
            <span>
              {new Intl.DateTimeFormat('pt-BR', {
                timeZone: timezone,
                day: '2-digit',
                month: '2-digit',
              }).format(new Date(task.dueAt))}
            </span>
          )}
          {task.priority !== 'NORMAL' && (
            <span className={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</span>
          )}
          {assignee && <span>{assignee}</span>}
          {task.client && <span>{task.client.name}</span>}
          {task.opportunity && <span>Oportunidade: {task.opportunity.title}</span>}
          {task.quote && <span>Orçamento #{task.quote.number}</span>}
          {task.checklist.length > 0 && (
            <span>
              {checklistDone}/{task.checklist.length}
            </span>
          )}
          {task.comments > 0 && (
            <span className="flex items-center gap-0.5">
              <MessageSquareIcon className="size-3" /> {task.comments}
            </span>
          )}
          {task.recurrence && <span>repete</span>}
        </div>
      </button>
      {task.client && (
        <Link
          href={`/clientes/${task.client.id}`}
          className="text-system-blue hidden text-[12px] hover:underline sm:block"
        >
          Abrir cliente
        </Link>
      )}
    </li>
  );
}
