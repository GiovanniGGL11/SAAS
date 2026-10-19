'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BotIcon, CheckIcon, PencilIcon, RepeatIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { AI_ACTION_KIND_LABEL, AI_PROPOSAL_STATUS_LABEL } from '@/lib/assistant';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ASSISTANT_PREFILL_EVENT } from '@/components/assistant/assistant-button';
import {
  confirmAssistantActionAction,
  listApprovalsAction,
  rejectProposalAction,
} from '@/server/actions/assistant-actions';

type Data =
  Awaited<ReturnType<typeof listApprovalsAction>> extends infer R
    ? R extends { ok: true; data: infer D }
      ? D
      : never
    : never;
type Item = Data['items'][number];

function fmt(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const STATUS_TONE: Record<string, string> = {
  AWAITING_APPROVAL: 'text-system-orange',
  COMPLETED: 'text-system-green',
  FAILED: 'text-system-red',
  REJECTED: 'text-label-secondary',
  CANCELED: 'text-label-secondary',
  EXPIRED: 'text-label-secondary',
  EXECUTING: 'text-system-blue',
};

/**
 * Central de aprovações: tudo o que a IA (assistente ou rotina) preparou e espera decisão. Aprovar
 * executa exatamente a proposta guardada, revalidando dados e permissões de quem aprova; se algo
 * mudou, a proposta volta com o conteúdo novo para aprovar de novo. Recusar não desfaz nada
 * porque nada foi executado.
 */
export function ApprovalsCenter({
  aiAvailable,
  blockedMessage,
}: {
  aiAvailable: boolean;
  blockedMessage: string | null;
}) {
  const [tab, setTab] = React.useState<'pending' | 'all'>('pending');
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['approvals', tab],
    queryFn: () => listApprovalsAction({ pending: tab === 'pending' }).then(unwrapResult),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['approvals'] });
    queryClient.invalidateQueries({ queryKey: ['notices'] });
  };

  return (
    <div className="flex flex-col gap-4">
      {!aiAvailable && blockedMessage && (
        <p className="bg-tile text-label-secondary rounded-2xl p-4 text-[14px]">
          {blockedMessage} Propostas pendentes ficam guardadas, mas não podem ser executadas agora.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          size="sm"
          value={tab}
          onValueChange={setTab}
          options={[
            { value: 'pending', label: 'Aguardando' },
            { value: 'all', label: 'Histórico' },
          ]}
        />
        {data && !data.isAdmin && (
          <span className="text-label-secondary text-[12px]">
            Você vê as suas propostas. Administradores veem as de toda a equipe.
          </span>
        )}
      </div>

      {!isLoading && data?.items.length === 0 ? (
        <EmptyState
          icon={BotIcon}
          title={tab === 'pending' ? 'Nada aguardando aprovação' : 'Nenhuma proposta ainda'}
          description="Quando o assistente preparar uma alteração (entrada de estoque, orçamento, cadastro), ela aparece aqui para você conferir antes de valer."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data?.items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              canDecide={aiAvailable && (data.isAdmin || item.mine)}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ApprovalCard({
  item,
  canDecide,
  onChanged,
}: {
  item: Item;
  canDecide: boolean;
  onChanged: () => void;
}) {
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [result, setResult] = React.useState<{ message: string; link: string | null } | null>(null);
  const approve = useMutation({
    mutationFn: () => confirmAssistantActionAction({ proposalId: item.id }).then(unwrapResult),
    onSuccess: (outcome) => {
      if (outcome.status === 'CHANGED') {
        toast.warning(
          'Os dados mudaram desde a proposta. Confira a versão atualizada e aprove de novo.',
          {
            duration: 9000,
          },
        );
      } else {
        toast.success(outcome.message);
        setResult({ message: outcome.message, link: outcome.link });
      }
      onChanged();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Não foi possível executar.', { duration: 9000 });
      onChanged();
    },
  });
  const reject = useMutation({
    mutationFn: () =>
      rejectProposalAction({ proposalId: item.id, note: note || null }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Proposta recusada. Nada foi alterado.');
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const pending = item.status === 'AWAITING_APPROVAL';
  const kindLabel =
    AI_ACTION_KIND_LABEL[item.kind as keyof typeof AI_ACTION_KIND_LABEL] ?? item.kind;

  return (
    <li className="bg-tile flex flex-col gap-3 rounded-3xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">{item.title}</div>
          <div className="text-label-secondary text-[12px]">
            {kindLabel} · pedido por {item.requestedByName} · {fmt(item.createdAt)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {item.origin === 'automation' ? (
            <Badge variant="outline">
              <RepeatIcon className="size-3" /> Rotina automática
            </Badge>
          ) : (
            <Badge variant="outline">
              <BotIcon className="size-3" /> Assistente
            </Badge>
          )}
          <span className={`text-[12px] font-medium ${STATUS_TONE[item.status] ?? ''}`}>
            {AI_PROPOSAL_STATUS_LABEL[item.status as keyof typeof AI_PROPOSAL_STATUS_LABEL] ??
              item.status}
          </span>
        </div>
      </div>

      <dl className="grid gap-1 text-[13px] sm:grid-cols-[10rem_1fr]">
        {item.details.map((d, i) => (
          <React.Fragment key={i}>
            <dt className="text-label-secondary">{d.label}</dt>
            <dd className="break-words">{d.value}</dd>
          </React.Fragment>
        ))}
      </dl>

      <div className="text-label-secondary flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        {pending && <span>Prazo para decidir: {fmt(item.expiresAt)}</span>}
        <span>Custo de IA para executar: nenhum (a execução não chama o modelo)</span>
        {item.decidedByName && item.decidedAt && (
          <span>
            Decidido por {item.decidedByName} em {fmt(item.decidedAt)}
          </span>
        )}
      </div>
      {item.decisionNote && (
        <p className="text-label-secondary text-[13px]">Motivo: “{item.decisionNote}”</p>
      )}
      {item.resultMessage && <p className="text-system-green text-[13px]">{item.resultMessage}</p>}
      {result?.link && (
        <Link href={result.link} className="text-system-blue text-[13px] hover:underline">
          Ver resultado
        </Link>
      )}
      {item.errorMessage && (
        <p className="text-system-red text-[13px]">
          Não foi executada: {item.errorMessage}. Nada foi alterado.
        </p>
      )}

      {pending && canDecide && (
        <div className="flex flex-col gap-2">
          {rejecting ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-0 flex-1"
                placeholder="Motivo (opcional)"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={reject.isPending}
                onClick={() => reject.mutate()}
              >
                Recusar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                Voltar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate()}>
                <CheckIcon /> {approve.isPending ? 'Executando…' : 'Aprovar e executar'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                <XIcon /> Recusar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent(ASSISTANT_PREFILL_EVENT, {
                      detail: { text: `Sobre a proposta "${item.title}", corrija: ` },
                    }),
                  )
                }
              >
                <PencilIcon /> Corrigir com o assistente
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
