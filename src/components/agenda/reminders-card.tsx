'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRingIcon, CheckIcon, CopyIcon, MessageCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { optimisticUpdate } from '@/lib/query-cache';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  listTomorrowRemindersAction,
  markReminderSentAction,
} from '@/server/actions/reminder-actions';

type Reminder = Awaited<ReturnType<typeof listTomorrowRemindersAction>>[number];

const REMINDERS_KEY = ['reminders-tomorrow'];

/**
 * Lembretes de amanhã: quem tem horário no dia seguinte e ainda não foi avisado. Um toque abre o
 * WhatsApp do cliente com o texto pronto (e o link para confirmar ou cancelar) e marca como enviado.
 * Quem tem e-mail e a empresa ligou o envio automático recebe sozinho (Configurações).
 */
export function RemindersCard() {
  const [open, setOpen] = React.useState(false);
  const queryClient = useQueryClient();
  const { data: reminders = [] } = useQuery({
    queryKey: REMINDERS_KEY,
    queryFn: listTomorrowRemindersAction,
    staleTime: 60_000,
  });

  const markSent = useMutation({
    mutationFn: (id: string) => markReminderSentAction(id).then(unwrapResult),
    onMutate: async (id) => ({
      rollback: await optimisticUpdate<Reminder[]>(queryClient, REMINDERS_KEY, (list) =>
        list.map((item) => (item.id === id ? { ...item, sent: true } : item)),
      ),
    }),
    onError: (_error, _id, context) => {
      context?.rollback();
      toast.error('Não foi possível marcar como enviado.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: REMINDERS_KEY }),
  });

  const pending = reminders.filter((item) => !item.sent).length;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-label-secondary px-1 text-[12px] font-semibold uppercase">Lembretes</h3>
      <Button variant="outline" className="justify-between" onClick={() => setOpen(true)}>
        <span className="flex items-center gap-2">
          <BellRingIcon className="size-4" />
          {reminders.length === 0
            ? 'Nada marcado para amanhã'
            : pending === 0
              ? 'Todos avisados para amanhã'
              : `${pending} para avisar (amanhã)`}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lembretes de amanhã</DialogTitle>
            <DialogDescription>
              Avise quem tem horário amanhã. A mensagem já vai pronta, com o link para confirmar ou
              cancelar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto">
            {reminders.length === 0 && (
              <p className="text-label-secondary py-6 text-center text-sm">
                Nenhum atendimento marcado para amanhã.
              </p>
            )}
            {reminders.map((item) => (
              <div key={item.id} className="bg-foreground/[0.04] rounded-2xl p-3.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.clientName}</div>
                    <div className="text-label-secondary text-[13px] break-words">
                      {item.timeLabel} · {item.serviceName} · {item.professionalName}
                    </div>
                  </div>
                  {item.sent && (
                    <Badge variant="secondary" className="shrink-0 gap-1">
                      <CheckIcon className="size-3" />
                      Avisado
                    </Badge>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {item.whatsappUrl && (
                    <Button size="sm" variant={item.sent ? 'ghost' : 'outline'} asChild>
                      <a
                        href={item.whatsappUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => !item.sent && markSent.mutate(item.id)}
                      >
                        <MessageCircleIcon className="size-3.5" />
                        {item.sent ? 'Enviar de novo' : 'Avisar no WhatsApp'}
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(item.message).then(
                        () => toast.success('Mensagem copiada.'),
                        () => toast.error('Não foi possível copiar.'),
                      );
                      if (!item.sent && !item.whatsappUrl) markSent.mutate(item.id);
                    }}
                  >
                    <CopyIcon className="size-3.5" />
                    Copiar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
