'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  CopyIcon,
  MailIcon,
  MessageCircleIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { unwrapResult } from '@/lib/action-result';
import {
  getProfessionalAccessAction,
  inviteProfessionalAction,
  revokeProfessionalAccessAction,
  type ProfessionalAccess,
} from '@/server/actions/professional-access-actions';

/**
 * Login do próprio profissional: o dono envia o convite para o e-mail do cadastro; o profissional
 * cria a senha pelo link e passa a ver, do celular, a agenda, os clientes e os ganhos dele.
 */
export function ProfessionalAccessCard({
  professionalId,
  name,
  phone,
}: {
  professionalId: string;
  name: string;
  /** WhatsApp do profissional, para mandar o link do convite. */
  phone?: string | null;
}) {
  const queryClient = useQueryClient();
  const key = ['professional-access', professionalId];
  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: () => getProfessionalAccessAction(professionalId).then(unwrapResult),
  });
  const onDone = (next: ProfessionalAccess) => queryClient.setQueryData(key, next);
  const invite = useMutation({
    mutationFn: () => inviteProfessionalAction(professionalId).then(unwrapResult),
    onSuccess: (next) => {
      onDone(next);
      toast.success(
        `Convite enviado para ${'email' in next ? next.email : 'o e-mail cadastrado'}.`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: () => revokeProfessionalAccessAction(professionalId).then(unwrapResult),
    onSuccess: (next) => {
      onDone(next);
      toast.success('Acesso removido.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const first = name.split(' ')[0] || 'o profissional';

  return (
    <section className="ring-foreground/[0.06] flex flex-col gap-3 rounded-2xl p-4 ring-1">
      <div className="flex items-start gap-3">
        <span className="bg-system-blue/12 text-system-blue flex size-9 shrink-0 items-center justify-center rounded-xl">
          <SmartphoneIcon className="size-4" />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold">Acesso do profissional</h3>
          <p className="text-label-secondary text-xs">
            Com login próprio, {first} vê pelo celular só a agenda, os clientes e os ganhos dele.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-9 w-full rounded-xl" />
      ) : isError || !data ? (
        <p className="text-label-secondary text-[13px]">
          Não foi possível consultar o acesso agora.
        </p>
      ) : data.status === 'no_email' ? (
        <p className="text-label-secondary text-[13px]">
          Cadastre o e-mail de {first} acima e salve para poder enviar o convite.
        </p>
      ) : data.status === 'active' ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-system-green flex items-center gap-1.5 text-[13px] font-medium">
            <CheckCircle2Icon className="size-4" /> Tem acesso
            {data.email ? ` (${data.email})` : ''}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={revoke.isPending}
            onClick={() => {
              if (window.confirm(`Tirar o acesso de ${first}? Ele deixa de entrar no Atendafy.`)) {
                revoke.mutate();
              }
            }}
          >
            Remover acesso
          </Button>
        </div>
      ) : data.status === 'invited' ? (
        <div className="flex flex-col gap-2">
          <span className="text-label-secondary flex items-center gap-1.5 text-[13px]">
            <MailIcon className="size-4" /> Convite enviado para {data.email} em{' '}
            {new Date(data.sentAt).toLocaleDateString('pt-BR')}. Falta {first} aceitar pelo e-mail.
          </span>
          {data.url && (
            <div className="bg-foreground/[0.03] flex flex-col gap-2 rounded-xl p-3">
              <span className="text-label-secondary text-[12px]">
                O e-mail não chegou? Olhe a caixa de spam e as abas Promoções/Atualizações, ou mande
                o link direto:
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(data.url!);
                      toast.success('Link do convite copiado.');
                    } catch {
                      toast.error('Não foi possível copiar. Use o botão do WhatsApp.');
                    }
                  }}
                >
                  <CopyIcon className="size-4" /> Copiar link
                </Button>
                <Button type="button" size="sm" variant="outline" asChild>
                  <a
                    href={whatsappInviteLink(phone, first, data.url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircleIcon className="size-4" /> Enviar pelo WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={invite.isPending}
              onClick={() => invite.mutate()}
            >
              {invite.isPending ? 'Enviando...' : 'Reenviar convite'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate()}
            >
              Cancelar convite
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          className="self-start"
          disabled={invite.isPending}
          onClick={() => invite.mutate()}
        >
          <MailIcon className="size-4" />
          {invite.isPending ? 'Enviando...' : `Enviar convite para ${data.email}`}
        </Button>
      )}
    </section>
  );
}

/** WhatsApp com a mensagem do convite (sem número, abre para escolher o contato). */
function whatsappInviteLink(phone: string | null | undefined, first: string, url: string) {
  const text = `Oi, ${first}! Este é o seu acesso ao Atendafy, para ver sua agenda e seus ganhos pelo celular. Toque no link e crie sua senha: ${url}`;
  const digits = (phone ?? '').replace(/\D/g, '');
  const number = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return number.length >= 12
    ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}
