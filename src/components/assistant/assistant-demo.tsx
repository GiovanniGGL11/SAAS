'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { SimpleMarkdown } from '@/components/assistant/simple-markdown';
import { unwrapResult } from '@/lib/action-result';
import { AI_DEMO_MAX_CHARS, AI_DEMO_SUGGESTIONS } from '@/lib/ai-demo';
import { askAssistantDemoAction } from '@/server/actions/assistant-actions';

type Entry = { question: string; reply: string };

/**
 * Demonstração da IA para plano sem IA: poucas perguntas diretas sobre o negócio, uma vez só.
 * As sugestões vêm primeiro, para a pessoa ver a IA respondendo com os dados dela.
 */
export function AssistantDemo({
  demo,
}: {
  demo: { total: number; used: number; remaining: number };
}) {
  const queryClient = useQueryClient();
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [remaining, setRemaining] = React.useState(demo.remaining);
  const [draft, setDraft] = React.useState('');
  const [pending, setPending] = React.useState<string | null>(null);

  const ask = useMutation({
    mutationFn: (question: string) => askAssistantDemoAction({ question }).then(unwrapResult),
    onMutate: (question) => setPending(question),
    onSuccess: (data, question) => {
      setEntries((e) => [...e, { question, reply: data.reply }]);
      setRemaining(data.remaining);
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['ai-status'] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPending(null),
  });

  const submit = (text: string) => {
    const q = text.trim();
    if (!q || ask.isPending || remaining <= 0) return;
    ask.mutate(q);
  };

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      <div className="bg-system-blue/[0.07] rounded-2xl p-4 text-sm">
        <p className="flex items-center gap-1.5 font-medium">
          <SparklesIcon className="text-system-blue size-4" /> Experimente a IA com os seus dados
        </p>
        <p className="text-label-secondary mt-1">
          {remaining > 0
            ? `Você tem ${remaining} de ${demo.total} perguntas de demonstração. Faça perguntas diretas sobre o seu negócio; a IA só consulta, não muda nada.`
            : `Você usou as ${demo.total} perguntas de demonstração.`}
        </p>
      </div>

      {entries.map((entry, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="bg-system-blue max-w-[88%] self-end rounded-2xl px-3.5 py-2 text-sm text-white">
            {entry.question}
          </div>
          <div className="bg-tile max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed">
            <SimpleMarkdown text={entry.reply} />
          </div>
        </div>
      ))}
      {pending && (
        <div className="flex flex-col gap-2">
          <div className="bg-system-blue max-w-[88%] self-end rounded-2xl px-3.5 py-2 text-sm text-white">
            {pending}
          </div>
          <div className="bg-tile text-label-secondary flex w-fit items-center gap-2 rounded-2xl px-3.5 py-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" /> Pensando…
          </div>
        </div>
      )}

      {remaining > 0 ? (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-label-secondary text-[12px]">Toque numa pergunta:</span>
            {AI_DEMO_SUGGESTIONS.filter((s) => !entries.some((e) => e.question === s)).map((s) => (
              <button
                key={s}
                type="button"
                disabled={ask.isPending}
                onClick={() => submit(s)}
                className="bg-tile hover:bg-foreground/[0.08] block w-full rounded-2xl px-4 py-3 text-left text-sm transition-colors disabled:opacity-60"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(draft);
            }}
            className="flex items-end gap-2"
          >
            <input
              value={draft}
              maxLength={AI_DEMO_MAX_CHARS}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ou escreva uma pergunta curta…"
              aria-label="Pergunta para a demonstração da IA"
              className="bg-foreground/[0.05] focus-visible:ring-ring/50 h-10 min-w-0 flex-1 rounded-[20px] px-4 text-base outline-none focus-visible:ring-3 md:text-sm"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Perguntar"
              disabled={!draft.trim() || ask.isPending}
            >
              <ArrowUpIcon />
            </Button>
          </form>
        </>
      ) : null}

      <div className="flex flex-col gap-1 pt-1">
        <Button
          variant={remaining > 0 ? 'outline' : 'default'}
          size="sm"
          className="self-start"
          asChild
        >
          <Link href="/assinatura">Ter o assistente completo</Link>
        </Button>
        <span className="text-label-secondary text-[11px]">
          No Profissional e no Pro: conversa completa, voz e ações com a sua aprovação.
        </span>
      </div>
    </div>
  );
}
