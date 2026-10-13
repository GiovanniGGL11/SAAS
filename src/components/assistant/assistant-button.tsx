'use client';

import * as React from 'react';
import { useAuth } from '@clerk/nextjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowUpIcon,
  CheckIcon,
  Loader2Icon,
  RotateCcwIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import type { AssistantChatMessage, AssistantProposal } from '@/lib/assistant';
import {
  confirmAssistantActionAction,
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
  status: 'pending' | 'done' | 'dismissed';
  result?: string;
};

type ChatEntry = {
  role: 'user' | 'model';
  text: string;
  proposals?: ProposalState[];
};

const SUGGESTIONS = [
  'Como está minha agenda amanhã?',
  'Quem não volta há 60 dias?',
  'Cadastrar cliente',
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
      (p) =>
        `[${p.proposal.title}: ${
          p.status === 'done'
            ? 'confirmada pela pessoa'
            : p.status === 'dismissed'
              ? 'recusada pela pessoa'
              : 'aguardando confirmação'
        }]`,
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
          {open && <AssistantChat configured={configured} />}
        </DrawerContent>
      </Drawer>
    </>
  );
}

function AssistantChat({ configured }: { configured: boolean }) {
  const { orgId } = useAuth();
  const key = storageKey(orgId);
  const [entries, setEntries] = React.useState<ChatEntry[]>(() => loadHistory(key));
  const [draft, setDraft] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => saveHistory(key, entries), [key, entries]);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries]);

  const send = useMutation({
    mutationFn: (history: ChatEntry[]) =>
      sendAssistantMessageAction({ messages: toServerHistory(history) }).then(unwrapResult),
    onSuccess: (data) =>
      setEntries((current) => [
        ...current,
        {
          role: 'model',
          text: data.reply,
          proposals: data.proposals.map((proposal) => ({ proposal, status: 'pending' })),
        },
      ]),
    onError: (error: Error, history) => {
      // Tira a pergunta que falhou e devolve o texto ao campo, para tentar de novo.
      setEntries(history.slice(0, -1));
      setDraft(history.at(-1)?.text ?? '');
      toast.error(error.message || 'Não foi possível falar com o assistente.');
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

  return (
    <>
      <DrawerHeader className="flex-row items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <DrawerTitle className="flex items-center gap-1.5">
            <SparklesIcon className="text-system-blue size-4" />
            Assistente
          </DrawerTitle>
          <DrawerDescription className="text-xs">
            Consulta a agenda e prepara ações para você confirmar.
          </DrawerDescription>
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
              Falta cadastrar a chave do Gemini (GEMINI_API_KEY) no servidor. Fale com quem
              administra o sistema.
            </p>
          </div>
        ) : entries.length === 0 ? (
          <div className="space-y-2 pt-2">
            <p className="text-label-secondary text-sm">Experimente perguntar:</p>
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
          className="border-foreground/[0.06] flex items-end gap-2 border-t p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        >
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
          <Button
            type="submit"
            size="icon"
            aria-label="Enviar"
            disabled={!draft.trim() || send.isPending}
          >
            <ArrowUpIcon />
          </Button>
        </form>
      )}
    </>
  );
}

function ProposalCard({
  state,
  onChange,
}: {
  state: ProposalState;
  onChange: (patch: Partial<ProposalState>) => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useMutation({
    mutationFn: () => confirmAssistantActionAction(state.proposal.action).then(unwrapResult),
    onSuccess: (data) => {
      toast.success(data.message);
      onChange({ status: 'done', result: data.message });
      // A ação pode mexer em agenda, clientes e listas abertas em outras telas.
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível concluir.'),
  });

  return (
    <div className="ring-foreground/10 bg-background w-full max-w-[88%] rounded-2xl p-3.5 text-sm ring-1">
      <p className="font-semibold">{state.proposal.title}</p>
      <dl className="mt-2 space-y-1">
        {state.proposal.details.map((d) => (
          <div key={d.label} className="flex gap-2">
            <dt className="text-label-secondary w-24 shrink-0">{d.label}</dt>
            <dd className="min-w-0 break-words">{d.value}</dd>
          </div>
        ))}
      </dl>
      {state.status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => confirm.mutate()}
            disabled={confirm.isPending}
          >
            {confirm.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
            Confirmar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => onChange({ status: 'dismissed' })}
            disabled={confirm.isPending}
          >
            <XIcon />
            Cancelar
          </Button>
        </div>
      ) : (
        <p
          className={cn(
            'mt-3 text-xs font-medium',
            state.status === 'done' ? 'text-system-green' : 'text-label-secondary',
          )}
        >
          {state.status === 'done' ? (state.result ?? 'Feito.') : 'Descartado.'}
        </p>
      )}
    </div>
  );
}
