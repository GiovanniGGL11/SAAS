'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import { listClientsAction } from '@/server/actions/client-actions';
import { listTeamAction } from '@/server/actions/task-actions';
import {
  addJobCommentAction,
  createJobAction,
  getJobAction,
  linkJobAppointmentAction,
  listJobStagesAction,
  listJobsAction,
  listLinkableAppointmentsAction,
  moveJobAction,
  toggleJobChecklistAction,
  updateJobAction,
} from '@/server/actions/job-actions';

const fmtDay = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(
    new Date(iso),
  );

/**
 * Serviços em andamento (Pro): trabalhos com várias etapas. Concluir não lança pagamento; os
 * horários continuam na agenda e são ligados ao serviço.
 */
export function JobsView({ timezone }: { timezone: string }) {
  const queryClient = useQueryClient();
  const [mine, setMine] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [now] = React.useState(() => Date.now());
  const { data: stages = [] } = useQuery({
    queryKey: ['job-stages'],
    queryFn: () => listJobStagesAction().then(unwrapResult),
  });
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs', mine],
    queryFn: () => listJobsAction({ mine }).then(unwrapResult),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    queryClient.invalidateQueries({ queryKey: ['job'] });
  };
  const move = useMutation({
    mutationFn: (input: { id: string; fromStageId: string; toStageId: string }) =>
      moveJobAction(input).then(unwrapResult),
    onSuccess: (r) =>
      r.moved &&
      toast.success(
        r.kind === 'DONE'
          ? 'Serviço concluído (nenhum pagamento foi lançado).'
          : 'Etapa atualizada.',
      ),
    onError: (e: Error) => toast.error(e.message, { duration: 8000 }),
    onSettled: refresh,
  });
  const openStages = stages.filter((s) => s.kind === 'OPEN');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[14px]">
          <Switch checked={mine} onCheckedChange={setMine} aria-label="Só os meus" /> Só os meus
        </label>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon className="size-4" /> Novo serviço
        </Button>
      </div>
      {!isLoading && jobs.length === 0 ? (
        <EmptyState
          icon={BriefcaseIcon}
          title="Nenhum serviço em andamento"
          description="Acompanhe trabalhos com várias etapas: do pedido à entrega, com checklist, prazos e horários ligados."
        />
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {openStages.map((stage) => {
            const items = jobs.filter((j) => j.stageId === stage.id);
            return (
              <section
                key={stage.id}
                className="bg-foreground/[0.03] flex w-72 shrink-0 flex-col gap-2 rounded-2xl p-2"
              >
                <h3 className="flex justify-between px-1 text-[13px] font-semibold">
                  {stage.name} <span className="text-label-secondary">{items.length}</span>
                </h3>
                {items.map((j) => {
                  const late = j.dueAt && new Date(j.dueAt).getTime() < now;
                  const done = j.checklist.filter((c) => c.done).length;
                  return (
                    <article
                      key={j.id}
                      className="bg-background flex flex-col gap-1 rounded-xl p-3 shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
                    >
                      <button type="button" className="text-left" onClick={() => setOpenId(j.id)}>
                        <div className="text-[14px] font-medium">{j.title}</div>
                        <div className="text-label-secondary text-[12px]">{j.client.name}</div>
                      </button>
                      <div className="text-label-secondary flex flex-wrap gap-x-2 text-[12px]">
                        {j.dueAt && (
                          <span className={late ? 'text-system-red' : ''}>
                            prazo {fmtDay(j.dueAt, timezone)}
                          </span>
                        )}
                        {j.checklist.length > 0 && (
                          <span>
                            {done}/{j.checklist.length}
                          </span>
                        )}
                        {j.portalVisible && <span>visível ao cliente</span>}
                      </div>
                      {j.canEdit && (
                        <Select
                          value=""
                          onValueChange={(v: string) =>
                            move.mutate({ id: j.id, fromStageId: j.stageId, toStageId: v })
                          }
                        >
                          <SelectTrigger
                            className="h-7 w-full text-[12px]"
                            aria-label={`Mover ${j.title}`}
                          >
                            <SelectValue placeholder="Mover para…" />
                          </SelectTrigger>
                          <SelectContent>
                            {stages
                              .filter((s) => s.id !== j.stageId)
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
                })}
              </section>
            );
          })}
        </div>
      )}
      {creating && (
        <NewJobDialog
          onClose={(id) => {
            setCreating(false);
            refresh();
            if (id) setOpenId(id);
          }}
        />
      )}
      {openId && (
        <JobDialog
          id={openId}
          timezone={timezone}
          stages={stages}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function NewJobDialog({ onClose }: { onClose: (id?: string) => void }) {
  const [form, setForm] = React.useState({ clientId: '', title: '', dueDate: '', ownerUserId: '' });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: listClientsAction });
  const { data: team } = useQuery({
    queryKey: ['team'],
    queryFn: () => listTeamAction().then(unwrapResult),
    staleTime: 300_000,
  });
  const save = useMutation({
    mutationFn: () =>
      createJobAction({
        ...form,
        dueDate: form.dueDate || null,
        ownerUserId: form.ownerUserId || null,
      }).then(unwrapResult),
    onSuccess: (r) => onClose(r.id),
    onError: (e: Error) => toast.error(e.message),
  });
  const options: ComboboxOption[] = clients
    .filter((c) => c.active)
    .map((c) => ({ value: c.id, label: c.name }));
  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo serviço em andamento</DialogTitle>
          <DialogDescription>
            Começa na primeira etapa. Também dá para criar a partir de um orçamento aprovado.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Combobox
            options={options}
            value={form.clientId}
            onChange={(v) => setForm((f) => ({ ...f, clientId: v }))}
            placeholder="Cliente"
          />
          <Input
            placeholder="Título (ex.: Reforma do banheiro)"
            maxLength={160}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            aria-label="Título"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              aria-label="Prazo"
            />
            <Select
              value={form.ownerUserId || 'none'}
              onValueChange={(v: string) =>
                setForm((f) => ({ ...f, ownerUserId: v === 'none' ? '' : v }))
              }
            >
              <SelectTrigger aria-label="Responsável">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem responsável</SelectItem>
                {team?.members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={!form.clientId || !form.title.trim() || save.isPending}>
            Criar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JobDialog({
  id,
  timezone,
  stages,
  onClose,
  onChanged,
}: {
  id: string;
  timezone: string;
  stages: { id: string; name: string; kind: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: job } = useQuery({
    queryKey: ['job', id],
    queryFn: () => getJobAction(id).then(unwrapResult),
  });
  const { data: linkable = [] } = useQuery({
    queryKey: ['job-linkable', id],
    queryFn: () => listLinkableAppointmentsAction(id).then(unwrapResult),
  });
  const [comment, setComment] = React.useState('');
  const [note, setNote] = React.useState<string | null>(null);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['job', id] });
    queryClient.invalidateQueries({ queryKey: ['job-linkable', id] });
    onChanged();
  };
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });
  if (!job) return null;
  const portalNote = note ?? job.portalNote ?? '';
  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{job.title}</DialogTitle>
          <DialogDescription>
            <Link href={`/clientes/${job.client.id}`} className="hover:underline">
              {job.client.name}
            </Link>{' '}
            · {job.stage.name}
            {job.dueAt && ` · prazo ${fmtDay(job.dueAt, timezone)}`}
          </DialogDescription>
        </DialogHeader>
        {job.canEdit && (
          <Select
            value={job.stage.id}
            onValueChange={(v: string) =>
              run.mutate(() =>
                moveJobAction({ id, fromStageId: job.stage.id, toStageId: v }).then(unwrapResult),
              )
            }
          >
            <SelectTrigger className="w-full sm:w-64" aria-label="Etapa">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {job.description && (
          <p className="text-label-secondary text-[13px] whitespace-pre-line">{job.description}</p>
        )}
        {job.checklist.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="text-[14px] font-semibold">Checklist</h3>
            {job.checklist.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={c.done}
                  disabled={!job.canEdit}
                  onChange={(e) =>
                    run.mutate(() =>
                      toggleJobChecklistAction({ id, itemId: c.id, done: e.target.checked }).then(
                        unwrapResult,
                      ),
                    )
                  }
                />
                <span className={cn(c.done && 'text-label-secondary line-through')}>{c.text}</span>
              </label>
            ))}
          </section>
        )}
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[14px] font-semibold">Horários ligados</h3>
          {job.appointments.length === 0 && (
            <p className="text-label-secondary text-[13px]">
              Nenhum ainda. Marque na Agenda e ligue aqui.
            </p>
          )}
          {job.appointments.map((a) => (
            <Link
              key={a.id}
              href={`/agenda/atendimento/${a.id}`}
              className="text-[13px] hover:underline"
            >
              {new Intl.DateTimeFormat('pt-BR', {
                timeZone: timezone,
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(a.startAt))}{' '}
              · {a.serviceNameSnapshot}
            </Link>
          ))}
          {job.canEdit && linkable.length > 0 && (
            <Select
              value=""
              onValueChange={(v: string) =>
                run.mutate(() =>
                  linkJobAppointmentAction({ id, appointmentId: v }).then(unwrapResult),
                )
              }
            >
              <SelectTrigger className="w-full sm:w-72" aria-label="Ligar agendamento">
                <SelectValue placeholder="Ligar um agendamento do cliente…" />
              </SelectTrigger>
              <SelectContent>
                {linkable.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {new Intl.DateTimeFormat('pt-BR', {
                      timeZone: timezone,
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(a.startAt))}{' '}
                    · {a.serviceNameSnapshot}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </section>
        {job.canEdit && (
          <section className="bg-foreground/[0.03] flex flex-col gap-2 rounded-2xl p-3">
            <label className="flex items-center justify-between gap-3 text-[14px]">
              Mostrar na área do cliente (só título, etapa e a mensagem abaixo)
              <Switch
                checked={job.portalVisible}
                onCheckedChange={(v: boolean) =>
                  run.mutate(() => updateJobAction({ id, portalVisible: v }).then(unwrapResult))
                }
                aria-label="Mostrar na área do cliente"
              />
            </label>
            {job.portalVisible && (
              <div className="flex gap-2">
                <Input
                  maxLength={500}
                  placeholder="Mensagem para o cliente (opcional)"
                  value={portalNote}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    run.mutate(() =>
                      updateJobAction({ id, portalNote: portalNote || null }).then(unwrapResult),
                    )
                  }
                >
                  Salvar
                </Button>
              </div>
            )}
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-[14px] font-semibold">Comentários e histórico (internos)</h3>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (comment.trim())
                run.mutate(async () => {
                  await addJobCommentAction({ id, body: comment }).then(unwrapResult);
                  setComment('');
                });
            }}
          >
            <Input
              placeholder="Comentário"
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              aria-label="Comentário"
            />
            <Button type="submit" size="sm" disabled={!comment.trim()}>
              Enviar
            </Button>
          </form>
          {job.events.map((e) => (
            <div key={e.id} className="text-[13px]">
              <span className="text-label-secondary">
                {new Intl.DateTimeFormat('pt-BR', {
                  timeZone: timezone,
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(e.createdAt))}
              </span>{' '}
              {e.kind === 'comment'
                ? e.body
                : e.kind === 'stage_change'
                  ? `Etapa: ${e.from} → ${e.to}`
                  : e.kind === 'created'
                    ? 'Criado'
                    : e.kind === 'appointment_linked'
                      ? 'Horário ligado'
                      : 'Alterado'}
            </div>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
