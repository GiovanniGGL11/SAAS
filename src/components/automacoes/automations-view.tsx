'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PauseIcon, PlayIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  createRoutineAuthorizationAction,
  getAutomationOverviewAction,
  getAutomationResultsAction,
  runRoutineNowAction,
} from '@/server/actions/automation-actions';
import { setAutomationPauseAction } from '@/server/actions/preferences-actions';
import { setAuthorizationStatusAction } from '@/server/actions/assistant-actions';

const ROUTINE_LABEL: Record<string, string> = {
  package_renewal: 'Renovação de pacotes',
  waitlist_auto: 'Lista de espera automática',
  daily_summary: 'Resumo do dia automático',
};
const RUN_STATUS: Record<string, string> = {
  COMPLETED: 'Concluída',
  PARTIAL: 'Parcial',
  FAILED: 'Falhou',
  SKIPPED: 'Pulada',
  RUNNING: 'Em andamento',
};
const STAT_LABEL: Record<string, string> = {
  checked: 'conferidos',
  tasksCreated: 'tarefas criadas',
  quotesPrepared: 'orçamentos preparados',
  alreadyHandled: 'já tratados',
  offersCreated: 'convites',
  messagesSent: 'mensagens enviadas',
  messagesSkipped: 'sem mensagem',
  failures: 'falhas',
};

function fmt(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {description && <p className="text-label-secondary text-[13px]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Ações automáticas: pausar (geral ou por rotina), autorizar rotinas, ver o que está em andamento
 * e o histórico. Pausar não trava o uso manual; retomar não executa o que ficou para trás.
 */
export function AutomationsView() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['automations'],
    queryFn: () => getAutomationOverviewAction().then(unwrapResult),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['automations'] });
  const pause = useMutation({
    mutationFn: (input: { routine: string; paused: boolean }) =>
      setAutomationPauseAction(input).then(unwrapResult),
    onSuccess: (_r, input) =>
      toast.success(
        input.paused
          ? 'Pausado. Nada novo será executado automaticamente.'
          : 'Retomado. A próxima execução revalida tudo do zero; nada atrasado é disparado.',
      ),
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });
  const runNow = useMutation({
    mutationFn: (routine: string) => runRoutineNowAction({ routine }).then(unwrapResult),
    onSuccess: (r) =>
      r.status === 'SKIPPED'
        ? toast.warning(`Não executada: ${'reason' in r ? r.reason : ''}`)
        : toast.success('Rotina executada. Veja o resultado no histórico.'),
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });
  const setAuth = useMutation({
    mutationFn: (input: { id: string; status: 'ACTIVE' | 'PAUSED' | 'REVOKED' }) =>
      setAuthorizationStatusAction(input).then(unwrapResult),
    onError: (e: Error) => toast.error(e.message),
    onSettled: refresh,
  });

  if (!data) return <p className="text-label-secondary text-sm">Carregando…</p>;
  const anyRoutineInPlan = data.plan.packageRenewal || data.plan.waitlistAutomation;

  return (
    <div className="flex flex-col gap-4">
      {!anyRoutineInPlan ? (
        <Section
          title="Rotinas automáticas"
          description="Renovação de pacotes, lista de espera automática e resumo do dia automático fazem parte do plano Pro. Tudo o que elas fazem continua disponível à mão no seu plano."
        >
          <Link href="/assinatura" className="text-system-blue text-[14px] hover:underline">
            Ver planos
          </Link>
        </Section>
      ) : (
        <>
          <Section
            title="Pausar ações automáticas"
            description="Bloqueia novas execuções de todas as rotinas. O uso manual do sistema continua normal e o histórico é preservado."
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] font-medium">
                {data.paused ? 'Tudo pausado' : 'Rotinas liberadas'}
              </span>
              {data.isAdmin && (
                <Button
                  variant={data.paused ? 'default' : 'outline'}
                  disabled={pause.isPending}
                  onClick={() => pause.mutate({ routine: 'all', paused: !data.paused })}
                >
                  {data.paused ? <PlayIcon /> : <PauseIcon />}
                  {data.paused ? 'Retomar' : 'Pausar tudo'}
                </Button>
              )}
            </div>
            {data.autonomy !== 'AUTO_RULES' && (
              <p className="text-[13px] text-amber-800 dark:text-amber-300">
                O modo da IA não está em “Executar regras autorizadas”: nenhuma rotina roda sozinha.
                Ajuste em Configurações → Inteligência artificial.
              </p>
            )}
          </Section>

          {data.tasks.map((task) => (
            <RoutineCard
              key={task.type}
              task={task}
              isAdmin={data.isAdmin}
              inPlan={
                task.type === 'package_renewal'
                  ? data.plan.packageRenewal
                  : data.plan.waitlistAutomation
              }
              routinePaused={data.paused || data.pausedRoutines.includes(task.type)}
              onPause={(paused) => pause.mutate({ routine: task.type, paused })}
              onRunNow={() => runNow.mutate(task.type)}
              onSetAuth={(status) =>
                task.authorization && setAuth.mutate({ id: task.authorization.id, status })
              }
              busy={pause.isPending || runNow.isPending || setAuth.isPending}
              onCreated={refresh}
            />
          ))}

          {data.inFlight.length > 0 && (
            <Section
              title="Em andamento"
              description="Convites automáticos já feitos continuam valendo até o prazo, mesmo com a pausa (o cliente já pode ter recebido). Para encerrar um, cancele o convite na Lista de espera."
            >
              <ul className="flex flex-col gap-1 text-[14px]">
                {data.inFlight.map((o) => (
                  <li key={o.id}>
                    {o.client} · {o.service} · {fmt(o.startAt)}{' '}
                    <span className="text-label-secondary">(prazo {fmt(o.expiresAt)})</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      <Section title="Histórico de execuções" description="Inclui as puladas, com o motivo.">
        {data.runs.length === 0 ? (
          <p className="text-label-secondary text-[13px]">Nenhuma execução ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.runs.map((run) => (
              <li key={run.id} className="bg-background/60 rounded-2xl px-3 py-2 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{ROUTINE_LABEL[run.routine] ?? run.routine}</span>
                  <span className="text-label-secondary">
                    {fmt(run.startedAt)} · {run.trigger === 'cron' ? 'automática' : 'manual'} ·{' '}
                    {RUN_STATUS[run.status] ?? run.status}
                  </span>
                </div>
                {run.note && <div className="text-label-secondary">{run.note}</div>}
                {Object.keys(run.stats).length > 0 && (
                  <div className="text-label-secondary">
                    {Object.entries(run.stats)
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => `${v} ${STAT_LABEL[k] ?? k}`)
                      .join(' · ') || 'nada a fazer'}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.plan.results && data.isAdmin && <ResultsSection />}
    </div>
  );
}

function RoutineCard({
  task,
  isAdmin,
  inPlan,
  routinePaused,
  onPause,
  onRunNow,
  onSetAuth,
  busy,
  onCreated,
}: {
  task: {
    type: string;
    label: string;
    description: string;
    authorization: {
      id: string;
      status: string;
      limits: Record<string, unknown> | null;
      scope: Record<string, unknown> | null;
    } | null;
  };
  isAdmin: boolean;
  inPlan: boolean;
  routinePaused: boolean;
  onPause: (paused: boolean) => void;
  onRunNow: () => void;
  onSetAuth: (status: 'ACTIVE' | 'PAUSED' | 'REVOKED') => void;
  busy: boolean;
  onCreated: () => void;
}) {
  const [maxPerDay, setMaxPerDay] = React.useState(task.type === 'waitlist_auto' ? '5' : '20');
  const [from, setFrom] = React.useState('8');
  const [to, setTo] = React.useState('20');
  const [sendMessages, setSendMessages] = React.useState(false);
  const authorize = useMutation({
    mutationFn: () =>
      createRoutineAuthorizationAction({
        taskType: task.type,
        maxPerDay: Number(maxPerDay),
        allowedFrom: Number(from),
        allowedTo: Number(to),
        sendMessages,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Rotina autorizada.');
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const auth = task.authorization;
  const limits = auth?.limits as {
    maxPerDay?: number;
    allowedHours?: { from: number; to: number };
  } | null;

  return (
    <Section title={task.label} description={task.description}>
      {!inPlan ? (
        <p className="text-label-secondary text-[13px]">Disponível no plano Pro.</p>
      ) : auth ? (
        <div className="flex flex-col gap-2 text-[14px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={auth.status === 'ACTIVE' && !routinePaused ? 'default' : 'outline'}>
              {auth.status === 'PAUSED'
                ? 'Autorização pausada'
                : routinePaused
                  ? 'Pausada'
                  : 'Autorizada'}
            </Badge>
            {limits?.maxPerDay && (
              <span className="text-label-secondary text-[13px]">
                até {limits.maxPerDay} por dia
                {limits.allowedHours &&
                  `, das ${limits.allowedHours.from}h às ${limits.allowedHours.to}h`}
                {task.type === 'waitlist_auto' &&
                  (auth.scope?.sendMessages ? ' · pode mandar WhatsApp' : ' · sem mensagens')}
              </span>
            )}
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onPause(!routinePaused)}
              >
                {routinePaused ? 'Retomar rotina' : 'Pausar rotina'}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={onRunNow}>
                Executar agora
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onSetAuth(auth.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED')}
              >
                {auth.status === 'PAUSED' ? 'Reativar autorização' : 'Pausar autorização'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onSetAuth('REVOKED')}
              >
                Revogar
              </Button>
            </div>
          )}
        </div>
      ) : isAdmin ? (
        <form
          className="flex flex-col gap-2 text-[13px]"
          onSubmit={(e) => {
            e.preventDefault();
            authorize.mutate();
          }}
        >
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-label-secondary">Máximo por dia</span>
              <Input
                type="number"
                min={1}
                max={50}
                value={maxPerDay}
                onChange={(e) => setMaxPerDay(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label-secondary">Das (hora)</span>
              <Input
                type="number"
                min={0}
                max={23}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label-secondary">Até (hora)</span>
              <Input
                type="number"
                min={1}
                max={24}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          {task.type === 'waitlist_auto' && (
            <label className="flex items-center justify-between gap-3">
              <span>
                Pode mandar o convite pelo WhatsApp (só com a integração configurada, dentro da
                janela de contato e para quem autorizou WhatsApp)
              </span>
              <Switch
                checked={sendMessages}
                onCheckedChange={setSendMessages}
                aria-label="Pode mandar WhatsApp"
              />
            </label>
          )}
          <Button type="submit" size="sm" className="self-start" disabled={authorize.isPending}>
            Autorizar esta rotina
          </Button>
        </form>
      ) : (
        <p className="text-label-secondary text-[13px]">
          Não autorizada. Só administradores autorizam rotinas.
        </p>
      )}
    </Section>
  );
}

function ResultsSection() {
  const [days, setDays] = React.useState(30);
  const { data } = useQuery({
    queryKey: ['automation-results', days],
    queryFn: () => getAutomationResultsAction({ days }).then(unwrapResult),
  });
  return (
    <Section
      title="Resultados das automações"
      description="Critério: conta só o que a própria rotina originou (tarefa, orçamento ou convite criado por ela). Agendado, vendido e recebido aparecem separados; recebido é só o pagamento lançado ligado a esses registros. Não estimamos tempo economizado."
    >
      <div className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <Button
            key={d}
            size="sm"
            variant={days === d ? 'default' : 'outline'}
            onClick={() => setDays(d)}
          >
            {d} dias
          </Button>
        ))}
      </div>
      {!data ? (
        <p className="text-label-secondary text-[13px]">Carregando…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric
            title="Tarefas criadas"
            value={data.tasks.created}
            detail={`${data.tasks.done} concluídas · ${data.tasks.open} abertas`}
          />
          <Metric
            title="Renovações"
            value={data.renewals.converted}
            detail={`${data.renewals.quotesPrepared} orçamentos preparados · ${data.renewals.approved} aprovados · vendido ${formatCurrencyBRL(data.renewals.soldValue)} · recebido ${formatCurrencyBRL(data.renewals.receivedValue)}`}
          />
          <Metric
            title="Vagas preenchidas pela lista"
            value={data.waitlist.bookings}
            detail={`${data.waitlist.offers} convites · ${data.waitlist.declined} recusados · ${data.waitlist.expired} sem resposta · agendado ${formatCurrencyBRL(data.waitlist.scheduledValue)} · realizado ${formatCurrencyBRL(data.waitlist.completedValue)} · recebido ${formatCurrencyBRL(data.waitlist.receivedValue)}`}
          />
          <Metric
            title="Mensagens e IA"
            value={data.messages.sent}
            detail={`${data.messages.sent} mensagens enviadas · ${data.messages.failed} falharam · ${data.aiCalls} usos de IA pelas rotinas`}
          />
          <div className="text-label-secondary text-[12px] sm:col-span-2">
            Execuções:{' '}
            {data.runs
              .map(
                (r) =>
                  `${ROUTINE_LABEL[r.routine]}: ${r.completed + r.partial} feitas, ${r.failed} falhas, ${r.skipped} puladas`,
              )
              .join(' · ')}
          </div>
        </div>
      )}
    </Section>
  );
}

function Metric({ title, value, detail }: { title: string; value: number; detail: string }) {
  return (
    <div className="bg-background/60 rounded-2xl p-3">
      <div className="text-label-secondary text-[12px]">{title}</div>
      <div className="text-[24px] font-semibold tabular-nums">{value}</div>
      <div className="text-label-secondary text-[12px]">{detail}</div>
    </div>
  );
}
