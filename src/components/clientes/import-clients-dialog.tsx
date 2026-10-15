'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, FileSpreadsheetIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { parseCsv, rowsToClients, type ImportedClient } from '@/lib/csv';
import { formatPhone } from '@/lib/phone';
import { unwrapResult } from '@/lib/action-result';
import { importClientsAction } from '@/server/actions/client-actions';

const TEMPLATE =
  'nome;telefone;email;cpf;nascimento;cep;rua;numero;complemento;bairro;cidade;uf\nMaria Silva;(11) 98888-7777;maria@email.com;;15/03/1990;01310-100;Avenida Paulista;1000;Sala 1;Bela Vista;São Paulo;SP\n';

// Celulares Android costumam entregar CSV como texto simples ou "ms-excel"; só ".csv" os escondia.
const ACCEPT = '.csv,text/csv,text/comma-separated-values,application/vnd.ms-excel,text/plain';

const DESCRIPTION =
  'Planilha CSV com uma coluna de nome e, se tiver, telefone, e-mail, CPF, nascimento e endereço (CEP, rua, número, bairro, cidade, UF). Quem já está cadastrado com o mesmo telefone é pulado.';

/** Trazer a base de clientes de outro sistema (Trinks, AppBarber, planilha) sem digitar um por um. */
export function ImportClientsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [clients, setClients] = React.useState<ImportedClient[] | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setClients(null);
    setFileName(null);
    setError(null);
  }

  const mutation = useMutation({
    mutationFn: () => importClientsAction(clients ?? []).then(unwrapResult),
    onSuccess: ({ created, skipped }) => {
      toast.success(
        `${created} clientes importados${skipped ? ` · ${skipped} já existiam ou estavam sem nome` : ''}.`,
      );
      reset();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível importar.'),
  });

  async function onFile(file: File) {
    setError(null);
    setFileName(file.name);
    const text = await file.text();
    const { clients: parsed, missingName } = rowsToClients(parseCsv(text));
    if (missingName) {
      setError(
        'Não achei a coluna de nome. A primeira linha precisa ter os títulos (ex.: nome; telefone).',
      );
      setClients(null);
      return;
    }
    setClients(parsed);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const body = (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      {/* O seletor nativo do navegador estoura em telas estreitas: um botão grande no lugar. */}
      <label
        className={cn(
          'bg-foreground/[0.05] hover:bg-foreground/[0.08] focus-within:ring-ring/50 flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 transition-colors focus-within:ring-2',
        )}
      >
        <input
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Zera o campo: escolher o mesmo arquivo de novo (já corrigido) tem de disparar de novo.
            e.target.value = '';
            if (file) void onFile(file);
          }}
        />
        <span className="bg-system-blue/12 text-system-blue flex size-9 shrink-0 items-center justify-center rounded-xl">
          <FileSpreadsheetIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">
            {fileName ?? 'Escolher planilha'}
          </span>
          <span className="text-label-secondary block text-[13px]">
            {fileName ? 'Toque para trocar o arquivo' : 'Arquivo .csv'}
          </span>
        </span>
      </label>

      <a
        className="text-system-blue inline-flex items-center gap-1.5 self-start py-1 text-[13px] font-medium hover:underline"
        href={`data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + TEMPLATE)}`}
        download="modelo-clientes.csv"
      >
        <DownloadIcon className="size-4" />
        Baixar modelo de planilha
      </a>

      {error && <p className="text-destructive">{error}</p>}
      {clients && (
        <div className="ring-foreground/[0.08] rounded-xl p-3 ring-1">
          <p className="font-medium">{clients.length} clientes encontrados</p>
          <ul className="text-label-secondary mt-2 flex flex-col gap-0.5 text-[13px]">
            {clients.slice(0, 5).map((c, i) => (
              <li key={i} className="truncate">
                {c.name}
                {c.phone ? ` · ${formatPhone(c.phone)}` : ''}
              </li>
            ))}
            {clients.length > 5 && <li>e mais {clients.length - 5}...</li>}
          </ul>
        </div>
      )}
    </div>
  );

  const actions = (
    <>
      <Button variant="ghost" onClick={() => handleOpenChange(false)}>
        Voltar
      </Button>
      <Button disabled={!clients?.length || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Importando...' : `Importar ${clients?.length ?? ''}`}
      </Button>
    </>
  );

  // Celular: folha que sobe da base, com rolagem própria e o botão de importar ao alcance do polegar.
  if (isMobile) {
    return (
      <Drawer direction="bottom" open={open} onOpenChange={handleOpenChange}>
        <DrawerContent className="font-apple">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-[17px] font-semibold">Importar clientes</DrawerTitle>
            <DrawerDescription>{DESCRIPTION}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 overflow-y-auto px-4 pb-2">{body}</div>
          <DrawerFooter className="flex-col-reverse">{actions}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar clientes</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{actions}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
