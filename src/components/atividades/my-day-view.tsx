'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClockIcon,
  CheckIcon,
  FileTextIcon,
  HandshakeIcon,
  ListChecksIcon,
  MessageCircleIcon,
  RepeatIcon,
  SparklesIcon,
  SunIcon,
  WalletIcon,
  ClipboardListIcon,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ASSISTANT_PREFILL_EVENT } from '@/components/assistant/assistant-button';
import { getMyDayAction } from '@/server/actions/my-day-actions';
import { listTeamAction, setTaskStatusAction } from '@/server/actions/task-actions';
import { getAiStatusAction } from '@/server/actions/assistant-actions';
import type { MyDayItem } from '@/server/data/my-day';

const KIND: Record<MyDayItem['kind'], { icon: LucideIcon; label: string; tone: string }> = {
  appointment: {
    icon: CalendarClockIcon,
    label: 'Atendimento',
    tone: 'text-system-blue bg-system-blue/10',
  },
  task: { icon: ListChecksIcon, label: 'Tarefa', tone: 'text-system-orange bg-system-orange/10' },
  return: { icon: RepeatIcon, label: 'Retorno', tone: 'text-system-green bg-system-green/10' },
  opportunity: {
    icon: HandshakeIcon,
    label: 'Oportunidade',
    tone: 'text-system-indigo bg-system-indigo/10',
  },
  quote: { icon: FileTextIcon, label: 'Orçamento', tone: 'text-system-indigo bg-system-indigo/10' },
  bill: { icon: WalletIcon, label: 'Conta', tone: 'text-system-red bg-system-red/10' },
  document: {
    icon: ClipboardListIcon,
    label: 'Documento',
    tone: 'text-label-secondary bg-foreground/[0.06]',
  },
};

const GROUP_TITLE = { overdue: 'Atrasado', today: 'Hoje', upcoming: 'Próximos' } as const;

/**
 * "Meu dia": atendimentos, tarefas, retornos, oportunidades, orçamentos, contas e documentos que
 * pedem atenção — ordenados por urgência, com o atalho para resolver. Funciona sem IA.
 */
export function MyDayView({ timezone }: { timezone: string }) {
  const queryClient = useQueryClient();
  const [owner, setOwner] = React.useState('all');
  const [days, setDays] = React.useState('1');
  const { data: team } = useQuery({
    queryKey: ['team'],
    queryFn: () => listTeamAction().then(unwrapResult),
    staleTime: 300_000,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['my-day', owner, days],
    queryFn: () => getMyDayAction({ owner, days: Number(days) }).then(unwrapResult),
  });
  const { data: ai } = useQuery({ queryKey: ['ai-status'], queryFn: () => getAiStatusAction() });
  const complete = useMutation({
    mutationFn: (id: string) => setTaskStatusAction({ id, status: 'DONE' }).then(unwrapResult),
    onSuccess: () => toast.success('Tarefa concluída.'),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['my-day'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const fmt = (iso: string, kind: MyDayItem['kind']) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      ...(kind === 'appointment' ? { hour: '2-digit', minute: '2-digit' } : {}),
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(iso));

  const groups = (['overdue', 'today', 'upcoming'] as const)
    .map((g) => ({ key: g, items: data?.items.filter((i) => i.urgency === g) ?? [] }))
    .filter((g) => g.items.length);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="w-44" aria-label="Responsável">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toda a equipe</SelectItem>
            <SelectItem value="me">Só o que é meu</SelectItem>
            {team?.members
              .filter((m) => m.userId !== team.me)
              .map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Hoje</SelectItem>
            <SelectItem value="3">Próximos 3 dias</SelectItem>
            <SelectItem value="7">Próximos 7 dias</SelectItem>
          </SelectContent>
        </Select>
        {data && (
          <span className="text-label-secondary text-[13px]">
            {data.counts.overdue > 0 && (
              <span className="text-system-red">{data.counts.overdue} atrasado(s) · </span>
            )}
            {data.counts.today} para hoje · {data.counts.upcoming} nos próximos dias
          </span>
        )}
        {ai?.assistant && data && data.items.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent(ASSISTANT_PREFILL_EVENT, {
                  detail: { text: 'Resuma o meu dia e diga o que priorizar.' },
                }),
              )
            }
          >
            <SparklesIcon /> Resumir com o assistente
          </Button>
        )}
      </div>

      {!isLoading && data?.items.length === 0 ? (
        <EmptyState
          icon={SunIcon}
          title="Nada pendente neste período"
          description="Atendimentos, tarefas, retornos e pendências aparecem aqui quando precisarem de atenção."
        />
      ) : (
        groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <h2
              className={cn(
                'text-[13px] font-semibold uppercase',
                group.key === 'overdue' ? 'text-system-red' : 'text-label-secondary',
              )}
            >
              {GROUP_TITLE[group.key]} · {group.items.length}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {group.items.map((item) => {
                const kind = KIND[item.kind];
                const Icon = kind.icon;
                return (
                  <li
                    key={item.key}
                    className="bg-tile flex items-center gap-3 rounded-2xl px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full',
                        kind.tone,
                      )}
                      aria-hidden
                    >
                      <Icon className="size-4" />
                    </span>
                    <Link href={item.href} className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{item.title}</span>
                      <span className="text-label-secondary block truncate text-[12px]">
                        {kind.label}
                        {item.at && ` · ${fmt(item.at, item.kind)}`}
                        {item.detail && ` · ${item.detail}`}
                      </span>
                    </Link>
                    {item.action?.type === 'complete_task' && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Concluir ${item.title}`}
                        disabled={complete.isPending}
                        onClick={() =>
                          item.action?.type === 'complete_task' &&
                          complete.mutate(item.action.taskId)
                        }
                      >
                        <CheckIcon />
                      </Button>
                    )}
                    {item.action?.type === 'whatsapp' && (
                      <Button size="icon-sm" variant="ghost" asChild>
                        <a
                          href={item.action.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Chamar ${item.title} no WhatsApp`}
                        >
                          <MessageCircleIcon />
                        </a>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
