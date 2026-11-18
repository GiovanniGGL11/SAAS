'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { CopyIcon, RefreshCwIcon, SparklesIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Surface } from '@/components/layout/page';
import { unwrapResult } from '@/lib/action-result';
import type { MedicalSummary } from '@/lib/medical-summary';
import { summarizeMedicalRecordAction } from '@/server/actions/medical-record-actions';

const SECTIONS: { key: Exclude<keyof MedicalSummary, 'overview'>; title: string }[] = [
  { key: 'alerts', title: 'Alertas e cuidados' },
  { key: 'treatment', title: 'Tratamento' },
  { key: 'recent', title: 'Últimos atendimentos' },
  { key: 'attention', title: 'Para olhar no próximo atendimento' },
];

function summaryText(s: MedicalSummary) {
  const parts = [s.overview];
  for (const { key, title } of SECTIONS) {
    if (s[key].length) parts.push(`${title}:\n${s[key].map((i) => `- ${i}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/** Resumo do prontuário com IA: gerado na hora, só na tela (não vira registro). */
export function AiSummary({ clientId }: { clientId: string }) {
  const [summary, setSummary] = React.useState<MedicalSummary | null>(null);
  const generate = useMutation({
    mutationFn: () => summarizeMedicalRecordAction(clientId).then(unwrapResult),
    onSuccess: (data) => setSummary(data),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!summary) {
    return (
      <Surface className="flex flex-wrap items-center gap-3 p-4">
        <SparklesIcon className="text-system-indigo size-5 shrink-0" />
        <p className="text-label-secondary min-w-0 flex-1 text-[13px]">
          <strong className="text-foreground">Resumo com IA</strong>: o essencial do prontuário em
          poucas linhas, para se preparar para o atendimento. Usa créditos de IA do plano.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={generate.isPending}
          onClick={() => generate.mutate()}
        >
          <SparklesIcon /> {generate.isPending ? 'Gerando...' : 'Gerar resumo'}
        </Button>
      </Surface>
    );
  }

  return (
    <Surface className="flex flex-col gap-3 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SparklesIcon className="text-system-indigo size-5" />
        <h2 className="flex-1 text-[16px] font-semibold">Resumo com IA</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            navigator.clipboard
              .writeText(summaryText(summary))
              .then(() => toast.success('Resumo copiado.'))
              .catch(() => toast.error('Não consegui copiar.'))
          }
        >
          <CopyIcon /> Copiar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={generate.isPending}
          onClick={() => generate.mutate()}
        >
          <RefreshCwIcon className={generate.isPending ? 'animate-spin' : undefined} /> Gerar de
          novo
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Fechar o resumo"
          onClick={() => setSummary(null)}
        >
          <XIcon />
        </Button>
      </div>
      <p className="text-[14px] leading-relaxed">{summary.overview}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {SECTIONS.filter(({ key }) => summary[key].length).map(({ key, title }) => (
          <div key={key} className="bg-foreground/[0.03] rounded-xl p-3">
            <h3 className="text-label-secondary mb-1.5 text-[12px] font-semibold tracking-wide uppercase">
              {title}
            </h3>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px]">
              {summary[key].map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-label-secondary text-[11px]">
        Gerado por IA a partir do que está registrado. Confira no prontuário antes de decidir. O
        resumo não fica salvo.
      </p>
    </Surface>
  );
}
