'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HandshakeIcon, PlusIcon, Settings2Icon } from 'lucide-react';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OpportunityForm } from '@/components/comercial/opportunity-form';
import { OpportunityDrawer } from '@/components/comercial/opportunity-drawer';
import { StagesDialog } from '@/components/comercial/stages-dialog';
import { useMoveOpportunity } from '@/components/comercial/move-stage';
import { listOpportunitiesAction, listStagesAction } from '@/server/actions/crm-actions';
import { listTeamAction } from '@/server/actions/task-actions';

type Opp =
  Awaited<ReturnType<typeof listOpportunitiesAction>> extends infer R
    ? R extends { ok: true; data: (infer D)[] }
      ? D
      : never
    : never;

/**
 * Funil de oportunidades: kanban (arrastar no computador ou "Mover para…" em qualquer tela) e
 * lista. Ganhas e perdidas ficam no histórico (filtro "Encerradas").
 */
export function OpportunitiesView({
  timezone,
  isAdmin,
  quotesEnabled,
  initialOpenId,
}: {
  timezone: string;
  isAdmin: boolean;
  quotesEnabled: boolean;
  initialOpenId?: string;
}) {
  const queryClient = useQueryClient();
  const [view, setView] = React.useState<'board' | 'list'>('board');
  const [status, setStatus] = React.useState<'OPEN' | 'WON' | 'LOST' | 'ALL'>('OPEN');
  const [owner, setOwner] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [openId, setOpenId] = React.useState<string | null>(initialOpenId ?? null);
  const [creating, setCreating] = React.useState(false);
  const [editingStages, setEditingStages] = React.useState(false);
  const [dragging, setDragging] = React.useState<Opp | null>(null);
  // Referência de "agora" fixa por montagem (render puro).
  const [now] = React.useState(() => Date.now());

  const { data: stages = [] } = useQuery({
    queryKey: ['crm-stages'],
    queryFn: () => listStagesAction().then(unwrapResult),
  });
  const { data: team } = useQuery({
    queryKey: ['team'],
    queryFn: () => listTeamAction().then(unwrapResult),
    staleTime: 300_000,
  });
  const { data: opps = [], isLoading } = useQuery({
    queryKey: ['opportunities', status, owner, search],
    queryFn: () =>
      listOpportunitiesAction({
        status,
        owner: owner === 'all' ? undefined : owner,
        search: search.trim() || undefined,
      }).then(unwrapResult),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    queryClient.invalidateQueries({ queryKey: ['opportunity'] });
  };
  const { request, dialog } = useMoveOpportunity(refresh);
  const names = (uid: string | null) =>
    uid
      ? uid === team?.me
        ? 'Você'
        : (team?.members.find((m) => m.userId === uid)?.name ?? 'Equipe')
      : null;

  const visibleStages = status === 'OPEN' ? stages.filter((s) => s.kind === 'OPEN') : stages;
  const closedStages = stages.filter((s) => s.kind !== 'OPEN');
  const totalEstimated = opps.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            size="sm"
            value={view}
            onValueChange={setView}
            options={[
              { value: 'board', label: 'Quadro' },
              { value: 'list', label: 'Lista' },
            ]}
          />
          <Select value={status} onValueChange={(v: string) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-36" aria-label="Situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">Em andamento</SelectItem>
              <SelectItem value="WON">Ganhas</SelectItem>
              <SelectItem value="LOST">Perdidas</SelectItem>
              <SelectItem value="ALL">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="w-40" aria-label="Responsável">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="me">Minhas</SelectItem>
              <SelectItem value="none">Sem responsável</SelectItem>
              {team?.members
                .filter((m) => m.userId !== team.me)
                .map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Input
            className="w-full sm:w-48"
            placeholder="Buscar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar oportunidade"
          />
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setEditingStages(true)}>
              <Settings2Icon className="size-4" /> Etapas
            </Button>
          )}
          <Button onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" /> Nova oportunidade
          </Button>
        </div>
      </div>
      {opps.length > 0 && (
        <p className="text-label-secondary text-[13px]">
          {opps.length} oportunidade{opps.length === 1 ? '' : 's'} · valor estimado somado{' '}
          {formatCurrencyBRL(totalEstimated)} (estimativa, não é receita)
        </p>
      )}

      {!isLoading && opps.length === 0 ? (
        <EmptyState
          icon={HandshakeIcon}
          title={status === 'OPEN' ? 'Nenhuma oportunidade em andamento' : 'Nada por aqui'}
          description="Registre quem pediu informação, orçamento ou demonstrou interesse e acompanhe até fechar."
        />
      ) : view === 'board' ? (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {visibleStages.map((stage) => {
            const items = opps.filter((o) => o.stageId === stage.id);
            return (
              <section
                key={stage.id}
                className={cn(
                  'bg-foreground/[0.03] flex w-72 shrink-0 flex-col gap-2 rounded-2xl p-2',
                  dragging && dragging.stageId !== stage.id && 'ring-system-blue/30 ring-2',
                )}
                onDragOver={(e) => dragging?.canEdit && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging && dragging.stageId !== stage.id)
                    request(dragging.id, dragging.stageId, stage);
                  setDragging(null);
                }}
                aria-label={stage.name}
              >
                <h3 className="flex items-center justify-between px-1 text-[13px] font-semibold">
                  {stage.name}
                  <span className="text-label-secondary tabular-nums">{items.length}</span>
                </h3>
                {items.map((o) => (
                  <OppCard
                    key={o.id}
                    opp={o}
                    now={now}
                    timezone={timezone}
                    owner={names(o.ownerUserId)}
                    stages={stages}
                    onOpen={() => setOpenId(o.id)}
                    onDragStart={() => setDragging(o)}
                    onDragEnd={() => setDragging(null)}
                    onMove={(to) => request(o.id, o.stageId, to)}
                  />
                ))}
              </section>
            );
          })}
          {status === 'OPEN' && dragging && (
            <div className="flex w-48 shrink-0 flex-col gap-2">
              {closedStages.map((stage) => (
                <div
                  key={stage.id}
                  onDragOver={(e) => dragging.canEdit && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    request(dragging.id, dragging.stageId, stage);
                    setDragging(null);
                  }}
                  className={cn(
                    'flex h-24 items-center justify-center rounded-2xl border-2 border-dashed text-[13px] font-medium',
                    stage.kind === 'WON'
                      ? 'border-system-green/50 text-system-green'
                      : 'border-system-red/50 text-system-red',
                  )}
                >
                  Soltar em {stage.name}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {opps.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setOpenId(o.id)}
                className="bg-tile hover:bg-foreground/[0.04] flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{o.title}</span>
                  <span className="text-label-secondary block truncate text-[13px]">
                    {o.client?.name ?? o.contactName ?? 'Contato'} · {o.stage.name}
                    {names(o.ownerUserId) && ` · ${names(o.ownerUserId)}`}
                  </span>
                </span>
                {o.estimatedValue != null && (
                  <span className="text-[14px] tabular-nums">
                    {formatCurrencyBRL(o.estimatedValue)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {dialog}
      <OpportunityDrawer
        opportunityId={openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        timezone={timezone}
        stages={stages}
        quotesEnabled={quotesEnabled}
        names={names}
      />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Nova oportunidade</DialogTitle>
            <DialogDescription>Começa na primeira etapa do funil.</DialogDescription>
          </DialogHeader>
          {creating && (
            <OpportunityForm
              timezone={timezone}
              onDone={(id) => {
                setCreating(false);
                refresh();
                if (id) setOpenId(id);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {isAdmin && (
        <StagesDialog open={editingStages} onOpenChange={setEditingStages} stages={stages} />
      )}
    </div>
  );
}

function OppCard({
  opp,
  now,
  timezone,
  owner,
  stages,
  onOpen,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  opp: Opp;
  now: number;
  timezone: string;
  owner: string | null;
  stages: { id: string; name: string; kind: string }[];
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (to: { id: string; name: string; kind: string }) => void;
}) {
  const late = opp.nextActionAt && new Date(opp.nextActionAt).getTime() < now;
  return (
    <article
      draggable={opp.canEdit}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="bg-background flex flex-col gap-1 rounded-xl p-3 shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
    >
      <button type="button" onClick={onOpen} className="text-left">
        <div className="text-[14px] font-medium">{opp.title}</div>
        <div className="text-label-secondary text-[12px]">
          {opp.client?.name ?? opp.contactName ?? 'Contato'}
        </div>
      </button>
      <div className="text-label-secondary flex flex-wrap gap-x-2 text-[12px]">
        {opp.estimatedValue != null && (
          <span className="tabular-nums">{formatCurrencyBRL(opp.estimatedValue)}</span>
        )}
        {opp.nextActionAt && (
          <span className={late ? 'text-system-red' : ''}>
            {opp.nextAction ? `${opp.nextAction} · ` : ''}
            {new Intl.DateTimeFormat('pt-BR', {
              timeZone: timezone,
              day: '2-digit',
              month: '2-digit',
            }).format(new Date(opp.nextActionAt))}
          </span>
        )}
        {owner && <span>{owner}</span>}
      </div>
      {opp.canEdit && (
        <Select
          value=""
          onValueChange={(v: string) => {
            const to = stages.find((s) => s.id === v);
            if (to) onMove(to);
          }}
        >
          <SelectTrigger className="h-7 w-full text-[12px]" aria-label={`Mover ${opp.title}`}>
            <SelectValue placeholder="Mover para…" />
          </SelectTrigger>
          <SelectContent>
            {stages
              .filter((s) => s.id !== opp.stageId)
              .map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}
    </article>
  );
}
