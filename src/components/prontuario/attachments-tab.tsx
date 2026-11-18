'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileIcon,
  ImageIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from '@/components/layout/page';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { unwrapResult } from '@/lib/action-result';
import {
  attachmentLinkAction,
  deleteAttachmentAction,
  listAttachmentsAction,
} from '@/server/actions/medical-record-actions';

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

const size = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Anexos do prontuário: exames, laudos de fora, documentos do paciente. Ficam no armazenamento
 * privado e abrem por um link que vale 5 minutos.
 */
export function AttachmentsTab({ clientId, timezone }: { clientId: string; timezone: string }) {
  const queryClient = useQueryClient();
  const input = React.useRef<HTMLInputElement>(null);
  const { data } = useQuery({
    queryKey: ['client-attachments', clientId],
    queryFn: () => listAttachmentsAction(clientId).then(unwrapResult),
  });
  const [deleting, setDeleting] = React.useState<{ id: string; name: string } | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['client-attachments', clientId] });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        if (file.size > MAX_BYTES) throw new Error(`"${file.name}" passa de 4 MB.`);
        const form = new FormData();
        form.set('clientId', clientId);
        form.set('file', file);
        form.set('name', file.name);
        const res = await fetch('/api/clientes/anexos', { method: 'POST', body: form });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Não foi possível enviar o arquivo.');
      }
      return files.length;
    },
    onSuccess: (count) => {
      toast.success(count === 1 ? 'Arquivo anexado.' : `${count} arquivos anexados.`);
      refresh();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      refresh();
    },
  });

  const open = useMutation({
    mutationFn: (vars: { id: string; download: boolean; win: Window | null }) =>
      attachmentLinkAction({ clientId, id: vars.id, download: vars.download }).then(unwrapResult),
    onSuccess: (r, vars) => {
      if (vars.win) vars.win.location.href = r.url;
      else window.location.href = r.url;
    },
    onError: (e: Error, vars) => {
      vars.win?.close();
      toast.error(e.message);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAttachmentAction({ clientId, id }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Arquivo excluído.');
      setDeleting(null);
      refresh();
    },
    onError: (e: Error) => {
      setDeleting(null);
      toast.error(e.message);
    },
  });

  if (!data) return <Skeleton className="h-48 rounded-[22px]" />;
  const when = (d: Date | string) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).format(new Date(d));

  return (
    <div className="flex flex-col gap-4">
      <Surface className="flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
        <div>
          <h2 className="text-[16px] font-semibold">Anexos</h2>
          <p className="text-label-secondary text-[12px]">
            Exames, laudos e documentos do paciente. PDF, JPG, PNG ou WebP, até 4 MB cada. Ficam
            guardados de forma privada.
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) upload.mutate(files);
          }}
        />
        <Button disabled={!data.storage || upload.isPending} onClick={() => input.current?.click()}>
          <UploadIcon /> {upload.isPending ? 'Enviando...' : 'Anexar arquivo'}
        </Button>
        {!data.storage && (
          <p className="text-system-orange w-full text-[12px]">
            O armazenamento de arquivos ainda não está configurado no servidor.
          </p>
        )}
      </Surface>

      {data.attachments.length === 0 ? (
        <p className="text-label-secondary py-6 text-center text-[14px]">Nenhum arquivo anexado.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.attachments.map((a) => (
            <li key={a.id}>
              <Surface className="flex flex-wrap items-center gap-3 p-3.5">
                {a.contentType === 'application/pdf' ? (
                  <FileIcon className="text-system-red size-5 shrink-0" />
                ) : (
                  <ImageIcon className="text-system-blue size-5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{a.name}</p>
                  <p className="text-label-secondary text-[12px]">
                    {when(a.createdAt)} · {size(a.sizeBytes)} · {a.uploadedByName}
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={open.isPending}
                  onClick={() => {
                    // A janela abre no clique (depois, o navegador bloquearia); o link vem em seguida.
                    const win = window.open('', '_blank');
                    open.mutate({ id: a.id, download: false, win });
                  }}
                >
                  <ExternalLinkIcon /> Abrir
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={open.isPending}
                  onClick={() => open.mutate({ id: a.id, download: true, win: null })}
                  aria-label={`Baixar ${a.name}`}
                >
                  <DownloadIcon />
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setDeleting({ id: a.id, name: a.name })}
                  aria-label={`Excluir ${a.name}`}
                >
                  <Trash2Icon />
                </Button>
              </Surface>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Excluir "${deleting?.name ?? ''}"?`}
        description="O arquivo sai do prontuário e do armazenamento. A exclusão fica registrada no histórico."
        confirmLabel="Excluir"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
