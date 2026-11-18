'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClockIcon, MessageCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { unwrapResult } from '@/lib/action-result';
import { getReturnPromptsAction, markReturnAction } from '@/server/actions/return-actions';

/** Fechou a janela hoje: não abre sozinha de novo até amanhã (o sino continua avisando). */
const closedKey = () => `atendafy:retornos-fechado:${new Date().toISOString().slice(0, 10)}`;

function readClosed(): boolean {
  try {
    return window.localStorage.getItem(closedKey()) === '1';
  } catch {
    return false;
  }
}
function writeClosed() {
  try {
    window.localStorage.setItem(closedKey(), '1');
  } catch {
    // Navegador sem armazenamento: a janela só volta a abrir na próxima visita.
  }
}

/**
 * Retorno do paciente na tela: quando o dia do retorno chega (e o envio automático não está
 * ligado), a janela aparece com a mensagem pronta. Enter abre o WhatsApp do cliente; a pessoa só
 * aperta "enviar" lá. Também abre pelo aviso do sino (?retornos=abrir).
 */
export function ReturnPrompt() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const askedToOpen = params.get('retornos') === 'abrir';
  const { data } = useQuery({
    queryKey: ['return-prompts'],
    queryFn: () => getReturnPromptsAction(),
    refetchInterval: 15 * 60_000,
  });
  const [open, setOpen] = React.useState(false);
  const [handled, setHandled] = React.useState<Set<string>>(() => new Set());
  const items = (data?.items ?? []).filter((i) => !handled.has(`${i.clientId}:${i.serviceId}`));
  const current = items[0] ?? null;
  const total = (data?.items ?? []).length;

  // Abre sozinha uma vez por dia quando os retornos chegam; pelo sino (?retornos=abrir), sempre.
  // Ajuste de estado durante o render (com guarda), no lugar de um efeito.
  const [autoChecked, setAutoChecked] = React.useState(false);
  const [lastAsked, setLastAsked] = React.useState(false);
  const hasItems = (data?.items.length ?? 0) > 0;
  if (hasItems && !autoChecked) {
    setAutoChecked(true);
    if (askedToOpen || !readClosed()) setOpen(true);
  }
  if (askedToOpen !== lastAsked) {
    setLastAsked(askedToOpen);
    if (askedToOpen && hasItems) setOpen(true);
  }

  const close = () => {
    setOpen(false);
    writeClosed();
    if (askedToOpen) router.replace(pathname, { scroll: false });
  };

  const mark = useMutation({
    mutationFn: (vars: {
      clientId: string;
      serviceId: string;
      status: 'SENT' | 'SNOOZED' | 'DISMISSED';
    }) => markReturnAction(vars).then(unwrapResult),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (vars.status === 'SNOOZED') toast('Vou lembrar de novo amanhã.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const act = (status: 'SENT' | 'SNOOZED' | 'DISMISSED') => {
    if (!current) return;
    // O WhatsApp abre no próprio clique (depois, o navegador bloquearia a janela).
    if (status === 'SENT' && current.whatsappUrl) window.open(current.whatsappUrl, '_blank');
    mark.mutate({ clientId: current.clientId, serviceId: current.serviceId, status });
    const next = new Set(handled);
    next.add(`${current.clientId}:${current.serviceId}`);
    setHandled(next);
    if (items.length <= 1) {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['return-prompts'] });
      if (askedToOpen) router.replace(pathname, { scroll: false });
      if (status === 'SENT') toast.success('Retornos em dia. Confira e envie no WhatsApp.');
    }
  };

  if (!current) return null;
  const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
  const position = total - items.length + 1;

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => (next ? setOpen(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClockIcon className="text-system-green size-5" /> Hora do retorno
            {total > 1 && (
              <span className="text-label-secondary text-[13px] font-normal">
                {position} de {total}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">{current.name}</strong> fez {current.serviceName} em{' '}
            {day(current.lastVisitAt)}. O retorno sugerido era{' '}
            {current.daysLate === 0
              ? 'hoje'
              : `${day(current.dueAt)} (há ${current.daysLate} ${current.daysLate === 1 ? 'dia' : 'dias'})`}
            .
          </DialogDescription>
        </DialogHeader>

        <p className="bg-foreground/[0.04] rounded-xl p-3 text-[13px] whitespace-pre-wrap">
          {current.message}
        </p>

        <div className="flex flex-col gap-2">
          <Button
            autoFocus
            disabled={!current.whatsappUrl || mark.isPending}
            onClick={() => act('SENT')}
          >
            <MessageCircleIcon /> Abrir WhatsApp e enviar
            <kbd className="ml-auto rounded bg-white/20 px-1.5 text-[11px]">Enter</kbd>
          </Button>
          {!current.whatsappUrl && (
            <span className="text-label-secondary text-[12px]">
              Este cliente não tem telefone no cadastro.{' '}
              <Link href={`/clientes/${current.clientId}`} className="text-system-blue underline">
                Abrir o cadastro
              </Link>
            </span>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={mark.isPending} onClick={() => act('SNOOZED')}>
              Lembrar amanhã
            </Button>
            <Button variant="ghost" disabled={mark.isPending} onClick={() => act('DISMISSED')}>
              Não chamar
            </Button>
          </div>
          <span className="text-label-secondary text-[11px]">
            Para enviar sozinho, sem perguntar, ligue &quot;Retorno do paciente&quot; em
            Configurações › WhatsApp automático.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
