'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CopyIcon,
  Loader2Icon,
  MessageCircleIcon,
  RefreshCwIcon,
  UserRoundIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getClientPortalLinkAction } from '@/server/actions/client-portal-actions';

/** Ficha do cliente → "Área do cliente": manda o link pessoal pelo WhatsApp em um toque. */
export function ClientPortalLinkButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [confirmRotate, setConfirmRotate] = React.useState(false);
  const queryKey = ['client-portal-link', clientId];
  const firstName = clientName.trim().split(/\s+/)[0];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => getClientPortalLinkAction({ clientId }).then(unwrapResult),
    enabled: open,
    staleTime: Infinity,
  });

  const rotate = useMutation({
    mutationFn: () => getClientPortalLinkAction({ clientId, rotate: true }).then(unwrapResult),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      setConfirmRotate(false);
      toast.success('Link novo gerado. Os links enviados antes pararam de funcionar.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function copy(text: string, message: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success(message));
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserRoundIcon className="size-4" />
        Área do cliente
      </Button>

      <Dialog open={open} onOpenChange={(next: boolean) => setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Área do cliente</DialogTitle>
            <DialogDescription>
              Mande para {firstName} o link pessoal. Ao abrir, o acesso fica salvo no celular: dá
              para ver os horários, confirmar, remarcar, cancelar e acompanhar a fidelidade.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="text-label-secondary flex items-center justify-center gap-2 py-6 text-sm">
              <Loader2Icon className="size-4 animate-spin" /> Gerando link…
            </div>
          ) : error ? (
            <p className="text-destructive text-sm">{(error as Error).message}</p>
          ) : data ? (
            <div className="flex flex-col gap-3">
              <div className="bg-foreground/[0.05] flex items-center gap-2 rounded-xl p-2 pl-3">
                <code className="min-w-0 flex-1 truncate text-[13px]">{data.url}</code>
                <Button variant="ghost" size="sm" onClick={() => copy(data.url, 'Link copiado.')}>
                  <CopyIcon className="size-4" /> Copiar
                </Button>
              </div>

              {data.whatsappUrl ? (
                <Button asChild size="lg">
                  <a href={data.whatsappUrl} target="_blank" rel="noreferrer">
                    <MessageCircleIcon className="size-5" />
                    Enviar pelo WhatsApp
                  </a>
                </Button>
              ) : (
                <p className="bg-foreground/[0.05] rounded-xl px-3 py-2 text-[13px]">
                  Sem celular cadastrado. Copie a mensagem e envie por onde preferir.
                </p>
              )}
              <Button variant="outline" onClick={() => copy(data.message, 'Mensagem copiada.')}>
                <CopyIcon className="size-4" /> Copiar mensagem
              </Button>

              <button
                type="button"
                onClick={() => setConfirmRotate(true)}
                className="text-label-secondary hover:text-foreground mt-1 flex items-center justify-center gap-1.5 text-[13px]"
              >
                <RefreshCwIcon className="size-3.5" />
                Trocou de celular ou o link vazou? Gerar novo link
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRotate}
        title="Gerar um link novo?"
        description={`Os links já enviados para ${firstName} deixam de funcionar e o acesso sai dos aparelhos conectados. Depois é só mandar o novo.`}
        confirmLabel={rotate.isPending ? 'Gerando…' : 'Gerar novo link'}
        pending={rotate.isPending}
        onConfirm={() => rotate.mutate()}
        onOpenChange={setConfirmRotate}
      />
    </>
  );
}
