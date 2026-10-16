'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowUpIcon,
  CheckIcon,
  LockIcon,
  Loader2Icon,
  MicOffIcon,
  RotateCcwIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import {
  AI_PROPOSAL_STATUS_LABEL,
  type AssistantChatMessage,
  type AssistantProposal,
} from '@/lib/assistant';
import { AUTONOMY_LABEL } from '@/lib/billing/entitlements';
import {
  cancelAssistantProposalAction,
  confirmAssistantActionAction,
  getAiStatusAction,
  getAssistantProposalsAction,
  sendAssistantMessageAction,
} from '@/server/actions/assistant-actions';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { SimpleMarkdown } from '@/components/assistant/simple-markdown';

type ProposalState = {
  proposal: AssistantProposal;
  /** Resultado real do servidor (só depois da execução confirmada). */
  result?: string;
  link?: string | null;
  /** A prévia mudou desde a última vez: precisa conferir de novo. */
  changed?: boolean;
};

type ChatEntry = {
  role: 'user' | 'model';
  text: string;
  proposals?: ProposalState[];
};

const SUGGESTIONS = [
  'Como está minha agenda amanhã?',
  'Quem não volta há 60 dias?',
  'Comprei 12 cremes por R$ 240, coloca no estoque',
];

// O histórico vive só nesta aba (sessionStorage), separado por empresa.
const storageKey = (orgId: string | null | undefined) => `atendafy:assistente:${orgId ?? 'none'}`;

function loadHistory(key: string): ChatEntry[] {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ChatEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(key: string, entries: ChatEntry[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(entries.slice(-40)));
  } catch {
    // Sem armazenamento a conversa só não sobrevive a um recarregar.
  }
}

/** O que vai ao servidor: só texto, com o desfecho das propostas para o modelo ter contexto. */
function toServerHistory(entries: ChatEntry[]): AssistantChatMessage[] {
  return entries.slice(-20).map((entry) => {
    const outcomes = (entry.proposals ?? []).map(
      (p) => `[${p.proposal.title}: ${AI_PROPOSAL_STATUS_LABEL[p.proposal.status].toLowerCase()}]`,
    );
    const text = [entry.text, ...outcomes].join('\n').slice(0, 4000);
    return { role: entry.role, text: text || '…' };
  });
}

export function AssistantButton({ configured }: { configured: boolean }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Assistente"
        title="Assistente"
        className="bg-foreground/[0.05] hover:bg-foreground/[0.08] text-system-blue flex size-9 items-center justify-center rounded-full transition-colors"
      >
        <SparklesIcon className="size-[18px]" />
      </button>
      <Drawer direction="right" open={open} onOpenChange={setOpen}>
        <DrawerContent className="font-apple h-[88svh] md:h-auto">
          {open && <AssistantPanel configured={configured} />}
        </DrawerContent>
      </Drawer>
    </>
  );
}

function AssistantPanel({ configured }: { configured: boolean }) {
  const { data: status, isLoading } = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => getAiStatusAction(),
  });

  if (isLoading || !status) {
    return (
      <div className="text-label-secondary flex items-center gap-2 p-6 text-sm">
        <Loader2Icon className="size-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!status.assistant) {
    // Plano sem IA (ou IA pausada): nada de chat funcional, só a explicação.
    return (
      <>
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-1.5">
            <SparklesIcon className="text-system-blue size-4" />
            Assistente de IA
          </DrawerTitle>
          <DrawerDescription className="text-xs">{status.companyName}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <div className="bg-tile flex flex-col gap-2 rounded-2xl p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <LockIcon className="size-4" /> Indisponível
            </p>
            <p className="text-label-secondary">{status.assistantMessage}</p>
            {status.isAdmin && !status.includedInPlan && (
              <Button variant="outline" size="sm" className="self-start" asChild>
                <Link href="/assinatura">Conhecer os planos</Link>
              </Button>
            )}
          </div>
        </div>
      </>
    );
  }

  return <AssistantChat configured={configured} status={status} />;
}

type Status = Awaited<ReturnType<typeof getAiStatusAction>>;

function AssistantChat({ configured, status }: { configured: boolean; status: Status }) {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const key = storageKey(orgId);
  const [entries, setEntries] = React.useState<ChatEntry[]>(() => loadHistory(key));
  const [draft, setDraft] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => saveHistory(key, entries), [key, entries]);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries]);

  // Ao reabrir, o estado real das propostas vem do servidor (expiradas, concluídas em outra aba).
  const pendingIds = React.useMemo(
    () =>
      entries.flatMap((e) =>
        (e.proposals ?? [])
          .filter((p) => p.proposal.status === 'AWAITING_APPROVAL')
          .map((p) => p.proposal.id),
      ),
    // Só na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const { data: fresh } = useQuery({
    queryKey: ['ai-proposals', pendingIds],
    queryFn: () => getAssistantProposalsAction({ ids: pendingIds }),
    enabled: pendingIds.length > 0,
  });
  const [appliedFresh, setAppliedFresh] = React.useState<typeof fresh>(undefined);
  if (fresh && fresh !== appliedFresh) {
    setAppliedFresh(fresh);
    const byId = new Map(fresh.map((p) => [p.id, p]));
    setEntries((current) =>
      current.map((entry) => ({
        ...entry,
        proposals: entry.proposals?.map((p) =>
          byId.has(p.proposal.id) ? { ...p, proposal: byId.get(p.proposal.id)! } : p,
        ),
      })),
    );
  }

  const send = useMutation({
    mutationFn: (history: ChatEntry[]) =>
      sendAssistantMessageAction({ messages: toServerHistory(history) }).then(unwrapResult),
    onSuccess: (data) => {
      setEntries((current) => [
        ...current,
        {
          role: 'model',
          text: data.reply,
          proposals: data.proposals.map((proposal) => ({ proposal })),
        },
      ]);
      queryClient.invalidateQueries({ queryKey: ['ai-status'] });
    },
    onError: (error: Error, history) => {
      // Tira a pergunta que falhou e devolve o texto ao campo, para tentar de novo.
      setEntries(history.slice(0, -1));
      setDraft(history.at(-1)?.text ?? '');
      toast.error(error.message || 'Não foi possível falar com o assistente.');
      queryClient.invalidateQueries({ queryKey: ['ai-status'] });
    },
  });

  function submit(text: string) {
    const message = text.trim();
    if (!message || send.isPending) return;
    const history: ChatEntry[] = [...entries, { role: 'user', text: message }];
    setEntries(history);
    setDraft('');
    send.mutate(history);
  }

  function updateProposal(id: string, patch: Partial<ProposalState>) {
    setEntries((current) =>
      current.map((entry) => ({
        ...entry,
        proposals: entry.proposals?.map((p) => (p.proposal.id === id ? { ...p, ...patch } : p)),
      })),
    );
  }

  const usage = status.usage;

  return (
    <>
      <DrawerHeader className="flex-row items-start justify-between gap-2 text-left">
        <div className="min-w-0">
          <DrawerTitle className="flex items-center gap-1.5">
            <SparklesIcon className="text-system-blue size-4" />
            Assistente
          </DrawerTitle>
          <DrawerDescription className="text-xs">
            {status.companyName} · Modo: {AUTONOMY_LABEL[status.autonomy.effective]}
          </DrawerDescription>
          {usage && (
            <p className="text-label-secondary mt-0.5 text-[11px]">
              {usage.used} de {usage.limit} usos de IA neste mês
              {status.provisionalUnits ? ' (limite provisório de desenvolvimento)' : ''}
            </p>
          )}
        </div>
        {entries.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEntries([])}
            disabled={send.isPending}
          >
            <RotateCcwIcon />
            Nova conversa
          </Button>
        )}
      </DrawerHeader>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {!configured ? (
          <div className="bg-tile text-label-secondary rounded-2xl p-4 text-sm">
            <p className="text-foreground font-medium">Assistente não configurado</p>
            <p className="mt-1">
              Falta cadastrar a chave do provedor de IA no servidor. Fale com quem administra o
              sistema.
            </p>
          </div>
        ) : entries.length === 0 ? (
          <div className="space-y-2 pt-2">
            <p className="text-label-secondary text-sm">
              {status.autonomy.effective === 'SUGGEST'
                ? 'Modo Sugerir: o assistente consulta e sugere, sem preparar alterações.'
                : 'Alterações aparecem como prévia e só valem depois que você confirmar.'}
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => submit(suggestion)}
                className="bg-tile hover:bg-foreground/[0.08] block w-full rounded-2xl px-4 py-3 text-left text-sm transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          entries.map((entry, i) => (
            <div
              key={i}
              className={cn('flex flex-col gap-2', entry.role === 'user' && 'items-end')}
            >
              <div
                className={cn(
                  'max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words',
                  entry.role === 'user'
                    ? 'bg-system-blue whitespace-pre-wrap text-white'
                    : 'bg-tile',
                )}
              >
                {entry.role === 'user' ? entry.text : <SimpleMarkdown text={entry.text} />}
              </div>
              {entry.proposals?.map((state) => (
                <ProposalCard
                  key={state.proposal.id}
                  state={state}
                  onChange={(patch) => updateProposal(state.proposal.id, patch)}
                  onEdit={() => setDraft(`Corrija a proposta "${state.proposal.title}": `)}
                />
              ))}
            </div>
          ))
        )}
        {send.isPending && (
          <div className="bg-tile text-label-secondary flex w-fit items-center gap-2 rounded-2xl px-3.5 py-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Pensando…
          </div>
        )}
      </div>

      {configured && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
          className="border-foreground/[0.06] flex flex-col gap-1 border-t p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit(draft);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Pergunte ou peça algo…"
              aria-label="Mensagem para o assistente"
              className="bg-foreground/[0.05] focus-visible:ring-ring/50 field-sizing-content max-h-32 min-h-10 flex-1 resize-none rounded-[20px] px-4 py-2 text-base outline-none focus-visible:ring-3 md:text-sm"
            />
            {/* Voz: o botão só aparece desabilitado e explica por quê — nada de gravação simulada. */}
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled
              aria-label={status.voiceMessage ?? 'Comandos de voz'}
              title={status.voiceMessage ?? 'Comandos de voz'}
            >
              <MicOffIcon />
            </Button>
            <Button
              type="submit"
              size="icon"
              aria-label="Enviar"
              disabled={!draft.trim() || send.isPending}
            >
              <ArrowUpIcon />
            </Button>
          </div>
          {!status.voice && (
            <p className="text-label-secondary px-2 text-[11px]">
              Comandos de voz: {status.voiceMessage}
            </p>
          )}
        </form>
      )}
    </>
  );
}

function ProposalCard({
  state,
  onChange,
  onEdit,
}: {
  state: ProposalState;
  onChange: (patch: Partial<ProposalState>) => void;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const { proposal } = state;
  const confirm = useMutation({
    mutationFn: () => confirmAssistantActionAction({ proposalId: proposal.id }).then(unwrapResult),
    onSuccess: (data) => {
      if (data.status === 'CHANGED') {
        toast.info('Algo mudou desde a prévia. Confira a versão atualizada e confirme de novo.');
        onChange({ proposal: data.proposal, changed: true });
        return;
      }
      toast.success(data.message);
      onChange({
        proposal: { ...proposal, status: 'COMPLETED' },
        result: data.message,
        link: data.link,
        changed: false,
      });
      // A ação pode mexer em agenda, clientes, estoque e listas abertas em outras telas.
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não foi possível concluir.');
      onChange({ proposal: { ...proposal, status: 'FAILED' }, result: error.message });
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelAssistantProposalAction({ proposalId: proposal.id }).then(unwrapResult),
    onSuccess: () => onChange({ proposal: { ...proposal, status: 'CANCELED' } }),
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = confirm.isPending || cancel.isPending;

  return (
    <div className="ring-foreground/10 bg-background w-full max-w-[88%] rounded-2xl p-3.5 text-sm ring-1">
      <p className="font-semibold">{proposal.title}</p>
      {state.changed && proposal.status === 'AWAITING_APPROVAL' && (
        <p className="mt-1 rounded-lg bg-amber-500/10 px-2 py-1 text-[12px] text-amber-800 dark:text-amber-300">
          A prévia foi atualizada. Confira antes de confirmar.
        </p>
      )}
      <dl className="mt-2 space-y-1">
        {proposal.details.map((d) => (
          <div key={d.label} className="flex gap-2">
            <dt className="text-label-secondary w-24 shrink-0">{d.label}</dt>
            <dd className="min-w-0 break-words">{d.value}</dd>
          </div>
        ))}
      </dl>
      {proposal.status === 'AWAITING_APPROVAL' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" className="flex-1" onClick={() => confirm.mutate()} disabled={busy}>
            {confirm.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
            Confirmar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => cancel.mutate()}
            disabled={busy}
          >
            <XIcon />
            Cancelar
          </Button>
          <Button size="sm" variant="ghost" className="w-full" onClick={onEdit} disabled={busy}>
            Corrigir
          </Button>
        </div>
      ) : (
        <p
          className={cn(
            'mt-3 text-xs font-medium',
            proposal.status === 'COMPLETED'
              ? 'text-system-green'
              : proposal.status === 'FAILED'
                ? 'text-system-red'
                : 'text-label-secondary',
          )}
        >
          {state.result ?? AI_PROPOSAL_STATUS_LABEL[proposal.status]}
          {state.link && proposal.status === 'COMPLETED' && (
            <>
              {' '}
              <Link href={state.link} className="text-system-blue underline">
                Abrir
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
