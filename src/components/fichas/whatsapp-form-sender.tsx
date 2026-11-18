'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2Icon, CopyIcon, MessageCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { unwrapResult } from '@/lib/action-result';
import {
  getWhatsappFormOptionsAction,
  sendFormViaWhatsappAction,
} from '@/server/actions/form-actions';

/**
 * Na agenda: mandar a anamnese (ou a ficha exigida pelo serviço) para o cliente pelo WhatsApp,
 * num toque. Pede a ficha, gera o link de 7 dias e abre a conversa com a mensagem pronta; quem
 * aperta "enviar" no WhatsApp é a pessoa. O cliente preenche e assina pelo celular.
 */
export function WhatsappFormSender({
  appointmentId,
  clientId,
  canceled,
}: {
  appointmentId: string;
  clientId: string;
  canceled: boolean;
}) {
  const isAdmin = useAuth().orgRole === 'org:admin';
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['whatsapp-form-options', appointmentId],
    queryFn: () => getWhatsappFormOptionsAction(appointmentId).then(unwrapResult),
  });
  const [fallback, setFallback] = React.useState<{ message: string; reason: string } | null>(null);

  const send = useMutation({
    mutationFn: (vars: { templateId: string; win: Window | null }) =>
      sendFormViaWhatsappAction({ appointmentId, templateId: vars.templateId }).then(unwrapResult),
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-form-options', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['appointment-forms', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['client-entries', clientId] });
      if (result.alreadyAnswered) {
        vars.win?.close();
        toast.info('Este cliente já respondeu esta ficha, e ela ainda vale. Não é preciso enviar.');
        return;
      }
      if (result.whatsappUrl && vars.win) {
        vars.win.location.href = result.whatsappUrl;
        setFallback({ message: result.message, reason: 'Se o WhatsApp não abriu' });
        toast.success('Ficha pedida. Confira a mensagem no WhatsApp e toque em enviar.');
        return;
      }
      vars.win?.close();
      setFallback({
        message: result.message,
        reason: result.whatsappUrl ? 'O navegador bloqueou a janela' : 'O cliente não tem telefone',
      });
    },
    onError: (e: Error, vars) => {
      vars.win?.close();
      toast.error(e.message);
    },
  });

  if (!data || canceled) return null;

  if (!data.available) {
    return isAdmin ? (
      <p className="text-label-secondary text-[12px]">
        Mandar a anamnese pelo WhatsApp, para o cliente assinar no celular, está no plano
        Profissional.{' '}
        <Link href="/fichas" className="text-system-blue underline">
          Testar grátis
        </Link>
      </p>
    ) : null;
  }
  if (!data.canRequest) return null;
  if (data.options.length === 0) {
    return isAdmin ? (
      <p className="text-label-secondary text-[12px]">
        Para mandar a anamnese pelo WhatsApp, cadastre um modelo de anamnese em{' '}
        <Link href="/fichas" className="text-system-blue underline">
          Fichas
        </Link>
        .
      </p>
    ) : null;
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Mensagem copiada. Cole no WhatsApp do cliente.');
    } catch {
      toast.error('Não deu para copiar. Selecione o texto e copie.');
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {data.options.map((option) => (
        <div
          key={option.templateId}
          className="bg-system-green/[0.07] flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[13px]"
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium">{option.name}</div>
            <div className="text-label-secondary text-[12px]">
              {option.state === 'answered'
                ? `Respondida${option.answeredAt ? ` em ${new Date(option.answeredAt).toLocaleDateString('pt-BR')}` : ''}`
                : option.state === 'open'
                  ? 'Pedida, esperando o cliente'
                  : 'O cliente preenche e assina pelo celular'}
            </div>
          </div>
          {option.state === 'answered' ? (
            <CheckCircle2Icon className="text-system-green size-4" aria-label="Respondida" />
          ) : (
            <Button
              size="xs"
              disabled={send.isPending}
              onClick={() => {
                // Abre a janela já no clique (depois, o navegador bloquearia) e só então gera o link.
                const win = window.open('', '_blank');
                send.mutate({ templateId: option.templateId, win });
              }}
            >
              <MessageCircleIcon />
              {option.state === 'open' ? 'Enviar de novo' : 'Enviar pelo WhatsApp'}
            </Button>
          )}
        </div>
      ))}
      {fallback && (
        <div className="bg-foreground/[0.03] flex flex-col gap-1.5 rounded-xl p-3 text-[12px]">
          <span className="text-label-secondary">
            {fallback.reason}, copie a mensagem e mande para o cliente:
          </span>
          <p className="bg-background rounded-lg p-2 whitespace-pre-wrap select-all">
            {fallback.message}
          </p>
          <Button
            size="xs"
            variant="outline"
            className="self-start"
            onClick={() => copy(fallback.message)}
          >
            <CopyIcon /> Copiar mensagem
          </Button>
        </div>
      )}
    </div>
  );
}
