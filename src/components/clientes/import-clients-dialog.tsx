'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseCsv, rowsToClients, type ImportedClient } from '@/lib/csv';
import { formatPhone } from '@/lib/phone';
import { unwrapResult } from '@/lib/action-result';
import { importClientsAction } from '@/server/actions/client-actions';

const TEMPLATE =
  'nome;telefone;email;cpf;nascimento\nMaria Silva;(11) 98888-7777;maria@email.com;;15/03/1990\n';

/** Trazer a base de clientes de outro sistema (Trinks, AppBarber, planilha) sem digitar um por um. */
export function ImportClientsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [clients, setClients] = React.useState<ImportedClient[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => importClientsAction(clients ?? []).then(unwrapResult),
    onSuccess: ({ created, skipped }) => {
      toast.success(
        `${created} clientes importados${skipped ? ` · ${skipped} já existiam ou estavam sem nome` : ''}.`,
      );
      setClients(null);
      onOpenChange(false);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível importar.'),
  });

  async function onFile(file: File) {
    setError(null);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) {
          setClients(null);
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar clientes</DialogTitle>
          <DialogDescription>
            Planilha CSV com uma coluna de nome e, se tiver, telefone, e-mail, CPF e nascimento.
            Quem já está cadastrado com o mesmo telefone é pulado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
            className="file:bg-foreground/[0.06] file:mr-3 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-[13px] file:font-medium"
          />
          <a
            className="text-system-blue self-start text-[13px] hover:underline"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent('﻿' + TEMPLATE)}`}
            download="modelo-clientes.csv"
          >
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            disabled={!clients?.length || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Importando...' : `Importar ${clients?.length ?? ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
