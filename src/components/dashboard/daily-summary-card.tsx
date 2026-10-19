'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, ListChecksIcon, Loader2Icon, SparklesIcon } from 'lucide-react';

import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ASSISTANT_PREFILL_EVENT } from '@/components/assistant/assistant-button';
import { getDailySummaryAction } from '@/server/actions/automation-actions';

/**
 * Resumo do dia: contagens e atalhos calculados direto do banco (sem IA). "Explicar com o
 * assistente" só abre o assistente com a pergunta — a IA lê o mesmo resumo, não o banco inteiro.
 */
export function DailySummaryCard({ aiAvailable }: { aiAvailable: boolean }) {
  const [open, setOpen] = React.useState(false);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['daily-summary'],
    queryFn: () => getDailySummaryAction().then(unwrapResult),
    enabled: open,
    staleTime: 60_000,
  });
  const attention = data?.sections.filter((s) => s.count > 0) ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (data) refetch();
        }}
        className="bg-tile hover:bg-foreground/[0.04] flex items-center gap-3 rounded-[22px] px-5 py-4 text-left transition-colors"
      >
        <span className="bg-system-blue/12 text-system-blue flex size-10 items-center justify-center rounded-full">
          <ListChecksIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold">Resumo do dia</span>
          <span className="text-label-secondary block text-[13px]">
            Atendimentos, fichas, pacotes, orçamentos, estoque e tarefas — com atalhos.
          </span>
        </span>
        <ChevronRightIcon className="text-label-secondary size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Resumo do dia</DialogTitle>
            <DialogDescription>
              {data
                ? data.automatic
                  ? `Gerado automaticamente às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(data.generatedAt))}.`
                  : 'Calculado agora, direto da agenda e dos cadastros.'
                : 'Calculando…'}
            </DialogDescription>
          </DialogHeader>
          {!data || isFetching ? (
            <div className="text-label-secondary flex items-center gap-2 py-6 text-sm">
              <Loader2Icon className="size-4 animate-spin" /> Calculando…
            </div>
          ) : attention.length === 0 ? (
            <p className="text-label-secondary py-6 text-center text-sm">
              Nada pendente hoje. Bom trabalho!
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {attention.map((section) => (
                <section key={section.key} className="flex flex-col gap-1.5">
                  <h3 className="flex items-center justify-between text-[14px] font-semibold">
                    {section.title}
                    <span className="bg-foreground/[0.06] rounded-full px-2 py-0.5 text-[12px] tabular-nums">
                      {section.count}
                    </span>
                  </h3>
                  <ul className="flex flex-col gap-1">
                    {section.items.map((item, i) => (
                      <li key={i}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="hover:bg-foreground/[0.04] flex items-center gap-2 rounded-xl px-2 py-1.5 text-[13px]"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{item.label}</span>
                            {item.detail && (
                              <span className="text-label-secondary"> · {item.detail}</span>
                            )}
                          </span>
                          <ChevronRightIcon className="text-label-secondary size-3.5 shrink-0" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {aiAvailable && data && attention.length > 0 && (
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(
                  new CustomEvent(ASSISTANT_PREFILL_EVENT, {
                    detail: { text: 'Explique o resumo de hoje e o que priorizar.' },
                  }),
                );
              }}
            >
              <SparklesIcon className="size-4" /> Explicar com o assistente
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
