'use client';

import { CustomFieldsEditor } from '@/components/custom-fields/custom-fields-editor';
import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { QUOTE_STATUS_LABEL } from '@/lib/quotes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OpportunityForm } from '@/components/comercial/opportunity-form';
import { MoveStageControl } from '@/components/comercial/move-stage';
import {
  addInteractionAction,
  convertContactAction,
  createFollowUpTaskAction,
  getOpportunityAction,
} from '@/server/actions/crm-actions';

const KIND_OPTIONS = [
  { value: 'note', label: 'Anotação' },
  { value: 'call', label: 'Ligação' },
  { value: 'message', label: 'Mensagem' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'email', label: 'E-mail' },
];

function fmt(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Detalhe da oportunidade: dados, etapa, interações, tarefas e orçamentos ligados. */
export function OpportunityDrawer({
  opportunityId,
  onOpenChange,
  timezone,
  stages,
  quotesEnabled,
  names,
}: {
  opportunityId: string | null;
  onOpenChange: (open: boolean) => void;
  timezone: string;
  stages: { id: string; name: string; kind: string }[];
  quotesEnabled: boolean;
  names: (userId: string | null) => string | null;
}) {
  const queryClient = useQueryClient();
  const { data: opp } = useQuery({
    queryKey: ['opportunity', opportunityId],
    queryFn: () => getOpportunityAction(opportunityId!).then(unwrapResult),
    enabled: !!opportunityId,
  });
  const [editing, setEditing] = React.useState(false);
  const [kind, setKind] = React.useState('note');
  const [body, setBody] = React.useState('');
  const [taskDate, setTaskDate] = React.useState('');
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['opportunity', opportunityId] });
    queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };
  const interact = useMutation({
    mutationFn: () => addInteractionAction({ id: opportunityId, kind, body }).then(unwrapResult),
    onSuccess: () => {
      setBody('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const followUp = useMutation({
    mutationFn: () =>
      createFollowUpTaskAction({ id: opportunityId, dueDate: taskDate || null }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Tarefa de retorno criada.');
      setTaskDate('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const convert = useMutation({
    mutationFn: () => convertContactAction(opportunityId).then(unwrapResult),
    onSuccess: (r) => {
      toast.success(
        r.created ? 'Cliente cadastrado.' : 'Ligado ao cliente que já tinha esse telefone.',
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Drawer direction="right" open={!!opportunityId} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full! data-[vaul-drawer-direction=right]:sm:max-w-xl!">
        {!opp ? (
          <div className="text-label-secondary p-6 text-sm">Carregando…</div>
        ) : (
          <>
            <DrawerHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DrawerTitle>{opp.title}</DrawerTitle>
                <Badge
                  variant={
                    opp.status === 'WON'
                      ? 'secondary'
                      : opp.status === 'LOST'
                        ? 'destructive'
                        : 'outline'
                  }
                >
                  {opp.stage.name}
                </Badge>
              </div>
              <DrawerDescription>
                {opp.client ? (
                  <Link href={`/clientes/${opp.client.id}`} className="hover:underline">
                    {opp.client.name}
                  </Link>
                ) : (
                  <>
                    {opp.contactName ?? 'Contato'}
                    {opp.contactPhone ? ` · ${opp.contactPhone}` : ''} (ainda não é cliente)
                  </>
                )}
                {opp.estimatedValue != null &&
                  ` · estimado ${formatCurrencyBRL(opp.estimatedValue)}`}
              </DrawerDescription>
            </DrawerHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6 text-sm">
              {opp.canEdit ? (
                <MoveStageControl
                  opportunityId={opp.id}
                  currentStageId={opp.stage.id}
                  stages={stages}
                  onMoved={refresh}
                />
              ) : (
                <p className="text-label-secondary text-[13px]">
                  Só {names(opp.ownerUserId) ?? 'o responsável'} ou um administrador altera esta
                  oportunidade.
                </p>
              )}
              {opp.status === 'LOST' && opp.lostReason && (
                <p className="bg-system-red/[0.06] rounded-xl px-3 py-2 text-[13px]">
                  Motivo da perda: {opp.lostReason}
                </p>
              )}

              {editing ? (
                <OpportunityForm
                  timezone={timezone}
                  initial={opp}
                  onDone={() => {
                    setEditing(false);
                    refresh();
                  }}
                />
              ) : (
                <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-[13px]">
                  <dt className="text-label-secondary">Responsável</dt>
                  <dd>{names(opp.ownerUserId) ?? 'Ninguém'}</dd>
                  <dt className="text-label-secondary">Origem</dt>
                  <dd>{opp.source ?? '—'}</dd>
                  <dt className="text-label-secondary">Interesse</dt>
                  <dd>{opp.services.map((s) => s.name).join(', ') || '—'}</dd>
                  <dt className="text-label-secondary">Próxima ação</dt>
                  <dd>
                    {opp.nextAction ?? '—'}
                    {opp.nextActionAt && ` · ${fmt(opp.nextActionAt, timezone).slice(0, 5)}`}
                  </dd>
                  <dt className="text-label-secondary">Previsão</dt>
                  <dd>
                    {opp.expectedCloseAt ? fmt(opp.expectedCloseAt, timezone).slice(0, 5) : '—'}
                  </dd>
                </dl>
              )}
              {opp.canEdit && !editing && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    Editar dados
                  </Button>
                  {!opp.client && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={convert.isPending}
                      onClick={() => convert.mutate()}
                    >
                      Cadastrar como cliente
                    </Button>
                  )}
                </div>
              )}

              <CustomFieldsEditor entity="opportunity" recordId={opp.id} />

              <section className="flex flex-col gap-2">
                <h3 className="text-[14px] font-semibold">Registrar interação</h3>
                <div className="flex gap-2">
                  <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger className="w-36" aria-label="Tipo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KIND_OPTIONS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!body.trim() || interact.isPending}
                    onClick={() => interact.mutate()}
                  >
                    Registrar
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  maxLength={2000}
                  placeholder="O que foi conversado?"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  aria-label="Interação"
                />
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-[14px] font-semibold">Tarefas</h3>
                {opp.tasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/atividades?tarefa=${t.id}`}
                    className="text-[13px] hover:underline"
                  >
                    {t.status === 'DONE' ? '✓ ' : t.status === 'CANCELED' ? '✕ ' : '• '}
                    {t.title}
                    {t.dueAt && ` — ${fmt(t.dueAt, timezone).slice(0, 5)}`}
                  </Link>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    className="w-40"
                    value={taskDate}
                    onChange={(e) => setTaskDate(e.target.value)}
                    aria-label="Retornar em"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={followUp.isPending}
                    onClick={() => followUp.mutate()}
                  >
                    Criar tarefa de retorno
                  </Button>
                </div>
              </section>

              {quotesEnabled && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-[14px] font-semibold">Orçamentos</h3>
                  {opp.quotes.map((q) => (
                    <Link
                      key={q.id}
                      href={`/comercial?aba=orcamentos&id=${q.id}`}
                      className="text-[13px] hover:underline"
                    >
                      #{q.number} {q.title} — {QUOTE_STATUS_LABEL[q.status]}
                    </Link>
                  ))}
                  {opp.client ? (
                    <Button size="sm" variant="outline" className="self-start" asChild>
                      <Link
                        href={`/comercial?aba=orcamentos&novo=${opp.client.id}&oportunidade=${opp.id}`}
                      >
                        Novo orçamento
                      </Link>
                    </Button>
                  ) : (
                    <p className="text-label-secondary text-[12px]">
                      Para fazer um orçamento, cadastre o contato como cliente.
                    </p>
                  )}
                </section>
              )}

              <section className="flex flex-col gap-1.5">
                <h3 className="text-[14px] font-semibold">Histórico</h3>
                {opp.events.map((e) => (
                  <div key={e.id} className="text-[13px]">
                    <span className="text-label-secondary">{fmt(e.createdAt, timezone)}</span>{' '}
                    <span className="font-medium">{e.label}</span>
                    {e.from && e.to && ` (${e.from} → ${e.to})`}
                    {e.body && <span className="block whitespace-pre-line">{e.body}</span>}
                    <span className="text-label-secondary"> · {names(e.userId) ?? 'Equipe'}</span>
                  </div>
                ))}
              </section>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
