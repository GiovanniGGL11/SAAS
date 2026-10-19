'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, MessageCircleIcon, PlusIcon, SendIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Surface } from '@/components/layout/page';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { unwrapResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import {
  createCampaignAction,
  getCampaignAction,
  listCampaignsAction,
  markCampaignSentAction,
  previewSegmentAction,
} from '@/server/actions/relationship-actions';
import { sendCampaignAutomaticallyAction } from '@/server/actions/whatsapp-actions';

const SEGMENT_OPTIONS = [
  {
    value: 'lapsed',
    label: 'Sumidos há mais de 60 dias',
    template:
      'Oi, {nome}! Faz um tempinho que você não vem. Que tal marcar seu horário esta semana?',
  },
  {
    value: 'birthdays',
    label: 'Aniversariantes do mês',
    template:
      'Parabéns, {nome}! 🎉 Neste mês de aniversário você tem um presente: use o cupom {cupom} no seu próximo horário.',
  },
  {
    value: 'vip',
    label: 'Clientes VIP',
    template:
      'Oi, {nome}! Como cliente VIP, você tem prioridade nos horários desta semana. Quer garantir o seu?',
  },
  {
    value: 'new',
    label: 'Novos (últimos 30 dias)',
    template:
      'Oi, {nome}! Obrigado por escolher a gente. Quando quiser voltar, é só responder esta mensagem.',
  },
  {
    value: 'all',
    label: 'Todos os clientes ativos',
    template: 'Oi, {nome}! Temos novidades e horários livres esta semana. Quer marcar?',
  },
] as const;
type SegmentValue = (typeof SEGMENT_OPTIONS)[number]['value'];
const segmentLabel = (v: string) => SEGMENT_OPTIONS.find((s) => s.value === v)?.label ?? v;

/** Mensagem para um grupo de clientes, enviada uma a uma pelo WhatsApp, com o retorno medido. */
export function MessagesView() {
  const [creating, setCreating] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const { data } = useQuery({ queryKey: ['campaigns'], queryFn: () => listCampaignsAction() });
  const date = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-label-secondary max-w-xl text-[14px]">
          Escolha um grupo (sumidos, aniversariantes, VIP...), escreva a mensagem uma vez e envie
          pelo WhatsApp com um clique por cliente. O painel mostra quantos marcaram horário depois.
        </p>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon className="size-4" />
          Nova campanha
        </Button>
      </div>
      <Surface>
        {!data || data.length === 0 ? (
          <EmptyState
            icon={MessageCircleIcon}
            title="Nenhuma campanha ainda"
            description="Comece pelos sumidos: é o grupo que mais volta com uma mensagem simples."
          />
        ) : (
          <ul className="divide-foreground/[0.06] divide-y">
            {data.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(c.id)}
                  className="hover:bg-foreground/[0.02] flex w-full flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.name}</span>
                    <span className="text-label-secondary text-[13px]">
                      {segmentLabel(c.segment)} · {date.format(new Date(c.createdAt))}
                    </span>
                  </span>
                  <span className="text-[13px] tabular-nums">
                    {c.sent} de {c.recipients} enviadas
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[12px] font-semibold tabular-nums',
                      c.returned > 0
                        ? 'bg-system-green/15 text-delta-good'
                        : 'bg-foreground/[0.06] text-label-secondary',
                    )}
                  >
                    {c.returned} {c.returned === 1 ? 'marcou' : 'marcaram'} horário
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Surface>
      {creating && (
        <NewCampaignDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setOpenId(id);
          }}
        />
      )}
      {openId && <CampaignDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function NewCampaignDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [segment, setSegment] = React.useState<SegmentValue>('lapsed');
  const [name, setName] = React.useState('Chamar os sumidos');
  const [message, setMessage] = React.useState<string>(SEGMENT_OPTIONS[0].template);
  const [coupon, setCoupon] = React.useState('');
  const { data: preview } = useQuery({
    queryKey: ['segment-preview', segment],
    queryFn: () => previewSegmentAction({ segment }),
  });
  const create = useMutation({
    mutationFn: () =>
      createCampaignAction({ name, segment, message, couponCode: coupon || undefined }).then(
        unwrapResult,
      ),
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onCreated(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>
            Use {'{nome}'} para o primeiro nome do cliente e {'{cupom}'} para o código do cupom.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Para quem</span>
            <select
              value={segment}
              onChange={(e) => {
                const next = SEGMENT_OPTIONS.find((s) => s.value === e.target.value)!;
                setSegment(next.value);
                setMessage(next.template);
                setName(next.label);
              }}
              className="bg-background ring-foreground/[0.08] h-10 rounded-xl px-3 ring-1"
            >
              {SEGMENT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="text-label-secondary text-[12px]">
              {preview
                ? `${preview.withPhone} ${preview.withPhone === 1 ? 'cliente' : 'clientes'} com WhatsApp${preview.total > preview.withPhone ? ` (${preview.total - preview.withPhone} sem telefone)` : ''}${preview.sample.length ? `: ${preview.sample.join(', ')}${preview.withPhone > preview.sample.length ? '…' : ''}` : ''}`
                : 'Contando...'}
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Nome da campanha</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Mensagem</span>
            <Textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Cupom (opcional)</span>
            <Input
              placeholder="Código de um cupom da aba Cupons"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              maxLength={40}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Voltar
            </Button>
            <Button type="submit" disabled={create.isPending || !preview?.withPhone}>
              Criar e começar a enviar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaignAction(id) });
  const mark = useMutation({
    mutationFn: (clientId: string) =>
      markCampaignSentAction({ campaignId: id, clientId }).then(unwrapResult),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
  const sent = data?.recipients.filter((r) => r.sentAt).length ?? 0;
  const auto = useMutation({
    mutationFn: () => sendCampaignAutomaticallyAction(id).then(unwrapResult),
    onSuccess: ({ queued }) => {
      toast.success(
        `Enviando ${queued} mensagens pelo WhatsApp automático, uma a cada ~2 segundos.`,
      );
      // Atualiza a lista enquanto as mensagens saem.
      const timer = setInterval(
        () => queryClient.invalidateQueries({ queryKey: ['campaign', id] }),
        4000,
      );
      setTimeout(() => clearInterval(timer), Math.min(queued, 60) * 2000 + 8000);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{data?.name ?? 'Campanha'}</DialogTitle>
          <DialogDescription>
            {data
              ? `${sent} de ${data.recipients.length} enviadas. Cada botão abre o WhatsApp com a mensagem pronta.`
              : 'Carregando...'}
          </DialogDescription>
        </DialogHeader>
        {data && (
          <>
            <div className="bg-foreground/[0.04] rounded-xl p-3 text-[13px] whitespace-pre-wrap">
              {data.recipients[0]?.text}
            </div>
            <ul className="divide-foreground/[0.06] max-h-80 divide-y overflow-y-auto">
              {data.recipients.map((r) => (
                <li key={r.clientId} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[14px]">{r.name}</span>
                  {r.sentAt ? (
                    <span className="text-delta-good flex items-center gap-1 text-[12px] font-semibold">
                      <CheckIcon className="size-3.5" /> Enviada
                    </span>
                  ) : r.whatsappUrl ? (
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={r.whatsappUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => mark.mutate(r.clientId)}
                      >
                        <SendIcon className="size-3.5" />
                        Enviar
                      </a>
                    </Button>
                  ) : (
                    <span className="text-label-secondary text-[12px]">Sem WhatsApp</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          {data && sent < data.recipients.length && (
            <Button variant="outline" disabled={auto.isPending} onClick={() => auto.mutate()}>
              Enviar todos automaticamente
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
