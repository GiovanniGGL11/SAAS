'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUpIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { IMPORT_LIMITS, type ImportKind, type Mapping } from '@/lib/import';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
  analyzeImportAction,
  previewImportAction,
  runImportAction,
} from '@/server/actions/import-actions';

type Analysis =
  Awaited<ReturnType<typeof analyzeImportAction>> extends infer R
    ? R extends { ok: true; data: infer D }
      ? D
      : never
    : never;
type Preview =
  Awaited<ReturnType<typeof previewImportAction>> extends infer R
    ? R extends { ok: true; data: infer D }
      ? D
      : never
    : never;
type Result =
  Awaited<ReturnType<typeof runImportAction>> extends infer R
    ? R extends { ok: true; data: infer D }
      ? D
      : never
    : never;

const OUTCOME_LABEL = {
  new: 'Novo',
  duplicate: 'Já existe',
  duplicate_in_file: 'Repetido no arquivo',
  invalid: 'Com erro',
} as const;
const REPORT_LABEL = {
  created: 'Criado',
  updated: 'Completado',
  skipped: 'Pulado',
  failed: 'Falhou',
};

const KIND_TEXT: Record<ImportKind, { title: string; noun: string; queryKey: string }> = {
  clients: { title: 'Importar clientes', noun: 'clientes', queryKey: 'clients' },
  products: { title: 'Importar produtos', noun: 'produtos', queryKey: 'products' },
};

/**
 * Importação assistida: arquivo → colunas → prévia (novos, duplicados, erros) → confirmar →
 * relatório. Nada é gravado antes da confirmação; nada existente é sobrescrito.
 */
export function ImportWizard({
  kind,
  open,
  onOpenChange,
}: {
  kind: ImportKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = React.useState<{ name: string; text: string } | null>(null);
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [mapping, setMapping] = React.useState<Mapping>({});
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [mode, setMode] = React.useState<'skip' | 'fill_empty'>('skip');
  const [result, setResult] = React.useState<Result | null>(null);
  const copy = KIND_TEXT[kind];

  const reset = () => {
    setFile(null);
    setAnalysis(null);
    setMapping({});
    setPreview(null);
    setResult(null);
    setMode('skip');
  };

  const analyze = useMutation({
    mutationFn: (text: string) => analyzeImportAction({ kind, text }).then(unwrapResult),
    onSuccess: (data) => {
      setAnalysis(data);
      setMapping(data.mapping);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const check = useMutation({
    mutationFn: () => previewImportAction({ kind, text: file!.text, mapping }).then(unwrapResult),
    onSuccess: setPreview,
    onError: (e: Error) => toast.error(e.message),
  });
  const run = useMutation({
    mutationFn: () =>
      runImportAction({
        kind,
        text: file!.text,
        mapping,
        fileName: file!.name,
        duplicateMode: mode,
      }).then(unwrapResult),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: [copy.queryKey] });
      queryClient.invalidateQueries({ queryKey: ['products-active'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    if (chosen.size > IMPORT_LIMITS.maxBytes) {
      toast.error('Arquivo grande demais. Divida em partes de até 5.000 linhas.');
      return;
    }
    if (!/\.(csv|txt)$/i.test(chosen.name)) {
      toast.error('Use um arquivo .csv (no Excel: Salvar como → CSV).');
      return;
    }
    const text = await chosen.text();
    setFile({ name: chosen.name, text });
    setPreview(null);
    setResult(null);
    analyze.mutate(text);
  }

  const step = result ? 4 : preview ? 3 : analysis ? 2 : 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next && (run.isPending || check.isPending)) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            Passo {step} de 4 · {['Arquivo', 'Colunas', 'Prévia', 'Relatório'][step - 1]}. Nada é
            gravado antes de você confirmar, e nenhum cadastro existente é sobrescrito.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <label className="border-foreground/15 hover:bg-foreground/[0.03] flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed p-8 text-center">
            {analyze.isPending ? (
              <Loader2Icon className="text-label-secondary size-8 animate-spin" />
            ) : (
              <FileUpIcon className="text-label-secondary size-8" />
            )}
            <span className="text-[15px] font-medium">Escolher arquivo CSV</span>
            <span className="text-label-secondary text-[12px]">
              Planilha salva como CSV (separada por ; ou ,), com cabeçalho. Até{' '}
              {IMPORT_LIMITS.maxRows.toLocaleString('pt-BR')} linhas.
            </span>
            <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={onFile} />
          </label>
        )}

        {step === 2 && analysis && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px]">
              <strong>{file?.name}</strong> · {analysis.totalRows} linha
              {analysis.totalRows === 1 ? '' : 's'}. Confira de qual coluna vem cada informação:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {analysis.fields.map((field) => (
                <label key={field.key} className="flex flex-col gap-1 text-[13px]">
                  <span className="text-label-secondary">
                    {field.label}
                    {field.required && ' (obrigatório)'}
                  </span>
                  <Select
                    value={mapping[field.key] == null ? 'none' : String(mapping[field.key])}
                    onValueChange={(v: string) =>
                      setMapping((m) => ({ ...m, [field.key]: v === 'none' ? null : Number(v) }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não importar</SelectItem>
                      {analysis.header.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h || `Coluna ${i + 1}`}
                          {analysis.sample[0]?.[i] ? ` — ex.: ${analysis.sample[0][i]}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button disabled={check.isPending} onClick={() => check.mutate()}>
                {check.isPending ? 'Conferindo…' : 'Conferir linhas'}
              </Button>
              <Button variant="ghost" onClick={reset}>
                Trocar arquivo
              </Button>
            </div>
          </div>
        )}

        {step === 3 && preview && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Count label="Novos" value={preview.newRows} tone="text-system-green" />
              <Count label="Já existem" value={preview.duplicates} />
              <Count label="Repetidos no arquivo" value={preview.duplicatesInFile} />
              <Count label="Com erro" value={preview.invalid} tone="text-system-red" />
            </div>
            {preview.duplicates > 0 && (
              <fieldset className="flex flex-col gap-1.5 text-[13px]">
                <legend className="text-label-secondary mb-1">Para os que já existem:</legend>
                <ModeOption
                  checked={mode === 'skip'}
                  onSelect={() => setMode('skip')}
                  title="Pular"
                  text="Mantém o cadastro como está."
                />
                {kind === 'clients' && (
                  <ModeOption
                    checked={mode === 'fill_empty'}
                    onSelect={() => setMode('fill_empty')}
                    title="Completar só os campos vazios"
                    text="Preenche o que está em branco no cadastro; nada que já existe é trocado."
                  />
                )}
              </fieldset>
            )}
            <div className="max-h-64 overflow-y-auto rounded-2xl border text-[13px]">
              <table className="w-full">
                <thead className="bg-foreground/[0.04] text-label-secondary sticky top-0 text-left">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Linha</th>
                    <th className="px-3 py-1.5 font-medium">Nome</th>
                    <th className="px-3 py-1.5 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row} className="border-t align-top">
                      <td className="px-3 py-1.5 tabular-nums">{r.row}</td>
                      <td className="px-3 py-1.5">{r.label}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={cn(
                            r.outcome === 'invalid' && 'text-system-red',
                            r.outcome === 'new' && 'text-system-green',
                          )}
                        >
                          {OUTCOME_LABEL[r.outcome]}
                        </span>
                        {r.messages.length > 0 && (
                          <span className="text-label-secondary block text-[12px]">
                            {r.messages.join(' ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.totalRows > preview.rows.length && (
              <p className="text-label-secondary text-[12px]">
                Mostrando as primeiras {preview.rows.length} de {preview.totalRows} linhas.
              </p>
            )}
            {preview.problems.length > 0 && (
              <details className="text-[12px]">
                <summary className="text-system-red cursor-pointer">
                  Ver todas as linhas com erro ({preview.invalid})
                </summary>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {preview.problems.map((p) => (
                    <li key={p.row}>
                      Linha {p.row}: {p.messages.join(' ')}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  run.isPending ||
                  preview.newRows + (mode === 'fill_empty' ? preview.duplicates : 0) === 0
                }
                onClick={() => run.mutate()}
              >
                {run.isPending ? 'Importando…' : `Importar ${preview.newRows} ${copy.noun}`}
              </Button>
              <Button variant="ghost" disabled={run.isPending} onClick={() => setPreview(null)}>
                Voltar às colunas
              </Button>
            </div>
          </div>
        )}

        {step === 4 && result && (
          <div className="flex flex-col gap-3">
            {result.repeated && (
              <p className="bg-system-blue/[0.06] text-system-blue rounded-xl px-3 py-2 text-[13px]">
                Este arquivo, com as mesmas escolhas, já tinha sido importado. Nada foi importado de
                novo — este é o relatório daquela vez.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Count label="Criados" value={result.created} tone="text-system-green" />
              <Count label="Completados" value={result.updated} />
              <Count label="Pulados" value={result.skipped} />
              <Count label="Falharam" value={result.failed} tone="text-system-red" />
            </div>
            {result.status === 'PARTIAL' && (
              <p className="text-[13px]">
                Importação parcial: as linhas abaixo não entraram. Corrija no arquivo e importe só
                elas (as que já entraram serão reconhecidas como existentes).
              </p>
            )}
            {result.report.length > 0 && (
              <ul className="max-h-64 overflow-y-auto text-[13px]">
                {result.report.map((r) => (
                  <li key={r.row}>
                    Linha {r.row} · {REPORT_LABEL[r.outcome]}
                    {r.message && ` — ${r.message}`}
                  </li>
                ))}
              </ul>
            )}
            <Button
              className="self-start"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              Concluir
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-foreground/[0.04] rounded-2xl p-3">
      <div className="text-label-secondary text-[12px]">{label}</div>
      <div className={cn('text-[22px] font-semibold tabular-nums', tone)}>{value}</div>
    </div>
  );
}

function ModeOption({
  checked,
  onSelect,
  title,
  text,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  text: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input type="radio" checked={checked} onChange={onSelect} className="mt-1" />
      <span>
        <span className="font-medium">{title}</span>
        <span className="text-label-secondary block text-[12px]">{text}</span>
      </span>
    </label>
  );
}
