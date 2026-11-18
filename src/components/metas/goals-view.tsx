'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  CalendarDaysIcon,
  FlagIcon,
  PencilIcon,
  TargetIcon,
  TrophyIcon,
  UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { GOAL_STATUS_LABEL, goalPace, type GoalPace } from '@/lib/goals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/layout/page';
import { HowToButton } from '@/components/tutorial/tutorial-kit';
import { InitialsAvatar } from '@/components/layout/list-controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  setCompanyGoalAction,
  setProfessionalGoalsAction,
  setShareGoalsAction,
} from '@/server/actions/goal-actions';
import type { CompanyGoalView, GoalsOverview, ProfessionalGoalView } from '@/server/data/goals';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const fmt = (unit: 'R$' | 'n', value: number) =>
  unit === 'R$' ? formatCurrencyBRL(value) : Math.round(value).toLocaleString('pt-BR');

const STATUS_STYLE: Record<GoalPace['status'], string> = {
  none: 'bg-foreground/[0.06] text-label-secondary',
  done: 'bg-system-green/15 text-system-green',
  ahead: 'bg-system-green/12 text-system-green',
  on_track: 'bg-system-blue/12 text-system-blue',
  behind: 'bg-system-orange/15 text-system-orange',
};
const BAR_STYLE: Record<GoalPace['status'], string> = {
  none: 'bg-foreground/20',
  done: 'bg-system-green',
  ahead: 'bg-system-green',
  on_track: 'bg-system-blue',
  behind: 'bg-system-orange',
};

function parseNumber(value: string): number | null {
  const n = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function GoalsView({
  data,
  isAdmin,
  ownProfessionalId,
}: {
  data: GoalsOverview;
  isAdmin: boolean;
  ownProfessionalId: string | null;
}) {
  const router = useRouter();
  const [, monthNumber] = data.month.split('-').map(Number);
  const monthName = MONTHS[monthNumber - 1];
  const daysLeft = data.totalDays - data.dayOfMonth + 1;
  const share = useMutation({
    mutationFn: (value: boolean) => setShareGoalsAction({ share: value }).then(unwrapResult),
    onSuccess: () => router.refresh(),
    onError: (e: Error) => toast.error(e.message),
  });
  const mine = ownProfessionalId ? data.team.find((p) => p.id === ownProfessionalId) : null;
  const ranking = [...data.team].sort((a, b) => score(b) - score(a));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Metas"
        description={
          isAdmin
            ? 'Defina as metas da empresa e de cada profissional e acompanhe o mês dia a dia.'
            : 'Acompanhe a sua meta do mês, definida pelo responsável.'
        }
        actions={<HowToButton href="/metas/tutorial" />}
      />

      {/* Mês em andamento */}
      <section className="bg-system-blue relative isolate overflow-hidden rounded-[26px] p-5 text-white md:p-6">
        <div className="pointer-events-none absolute -top-16 -right-16 -z-10 size-56 rounded-full bg-white/15 blur-2xl" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-medium text-white/80">
              <CalendarDaysIcon className="size-4" /> Metas de {monthName}
            </div>
            <div className="mt-1 text-[28px] leading-tight font-bold tracking-[-0.02em] md:text-[34px]">
              Dia {data.dayOfMonth} de {data.totalDays}
            </div>
            <div className="text-[14px] text-white/85">
              {daysLeft === 1 ? 'Último dia do mês' : `Faltam ${daysLeft} dias, contando hoje`}
            </div>
          </div>
          {isAdmin && (
            <label className="flex items-center gap-3 rounded-2xl bg-white/15 px-4 py-3 text-[13px]">
              <Switch
                checked={data.shareWithTeam}
                disabled={share.isPending}
                onCheckedChange={(v: boolean) => share.mutate(v)}
                aria-label="Mostrar as metas da empresa para a equipe"
              />
              <span>
                <span className="block font-semibold">Equipe vê a meta da empresa</span>
                <span className="text-white/80">Cada um sempre vê a própria meta.</span>
              </span>
            </label>
          )}
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${(data.dayOfMonth / data.totalDays) * 100}%` }}
          />
        </div>
      </section>

      {/* Meta do profissional logado */}
      {mine && (
        <section className="flex flex-col gap-3">
          <SectionTitle icon={TargetIcon} title="Minha meta" />
          <ProfessionalCard pro={mine} data={data} isAdmin={false} highlight />
        </section>
      )}

      {/* Empresa */}
      {data.company && (
        <section className="flex flex-col gap-3">
          <SectionTitle
            icon={FlagIcon}
            title="Metas da empresa"
            subtitle={
              isAdmin
                ? 'Valem a partir deste mês e continuam nos próximos até você mudar.'
                : undefined
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 md:gap-4">
            {data.company.map((goal) => (
              <CompanyGoalCard key={goal.metric} goal={goal} data={data} isAdmin={isAdmin} />
            ))}
          </div>
        </section>
      )}

      {/* Equipe (dono) */}
      {isAdmin && (
        <section className="flex flex-col gap-3">
          <SectionTitle
            icon={UsersIcon}
            title="Metas da equipe"
            subtitle="Produção (o que foi cobrado pelos serviços) e atendimentos concluídos no mês. Valem todo mês até você mudar."
          />
          {ranking.length === 0 ? (
            <p className="bg-tile text-label-secondary rounded-[22px] p-5 text-[14px]">
              Nenhum profissional ativo.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              {ranking.map((pro, index) => (
                <ProfessionalCard
                  key={pro.id}
                  pro={pro}
                  data={data}
                  isAdmin
                  rank={score(pro) > 0 ? index + 1 : null}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {!isAdmin && !mine && !data.company && (
        <p className="bg-tile text-label-secondary rounded-[22px] p-5 text-[14px]">
          Ainda não há metas para você acompanhar. O responsável pela empresa define as metas aqui.
        </p>
      )}
    </div>
  );
}

/** Para o ranking: média do quanto cada um já alcançou das metas que tem. */
function score(pro: ProfessionalGoalView) {
  const parts = [
    pro.revenue.target ? pro.revenue.actual / pro.revenue.target : null,
    pro.appointments.target ? pro.appointments.actual / pro.appointments.target : null,
  ].filter((v): v is number => v !== null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="bg-system-blue/12 text-system-blue mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl">
        <Icon className="size-4" />
      </span>
      <div>
        <h2 className="text-[20px] font-bold tracking-[-0.02em]">{title}</h2>
        {subtitle && <p className="text-label-secondary text-[13px]">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Barra de progresso com a marca de onde deveria estar hoje. */
function ProgressBar({ pace, large }: { pace: GoalPace; large?: boolean }) {
  const pct = Math.min(pace.percent ?? 0, 100);
  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          'bg-foreground/[0.08] relative overflow-hidden rounded-full',
          large ? 'h-3' : 'h-2',
        )}
        role="progressbar"
        aria-valuenow={Math.round(pace.percent ?? 0)}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700',
            BAR_STYLE[pace.status],
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Pace({ pace, unit }: { pace: GoalPace; unit: 'R$' | 'n' }) {
  if (pace.status === 'none') return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
      <span className={cn('rounded-full px-2 py-0.5 font-semibold', STATUS_STYLE[pace.status])}>
        {GOAL_STATUS_LABEL[pace.status]}
      </span>
      {pace.status !== 'done' && pace.remaining !== null && (
        <span className="text-label-secondary">
          Falta {fmt(unit, pace.remaining)} · {fmt(unit, pace.perDayNeeded ?? 0)} por dia
        </span>
      )}
      <span className="text-label-secondary">Projeção: {fmt(unit, pace.projection)}</span>
    </div>
  );
}

function CompanyGoalCard({
  goal,
  data,
  isAdmin,
}: {
  goal: CompanyGoalView;
  data: GoalsOverview;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const pace = goalPace({
    target: goal.target,
    actual: goal.actual,
    dayOfMonth: data.dayOfMonth,
    totalDays: data.totalDays,
  });
  return (
    <article className="bg-tile flex flex-col gap-3 rounded-[22px] p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-label-secondary text-[13px] font-medium">{goal.label}</div>
        {isAdmin && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <PencilIcon className="size-3.5" /> {goal.target ? 'Mudar' : 'Definir meta'}
          </Button>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] leading-none font-bold tracking-[-0.02em] tabular-nums">
          {fmt(goal.unit, goal.actual)}
        </span>
        {goal.target && (
          <span className="text-label-secondary text-[14px] tabular-nums">
            de {fmt(goal.unit, goal.target)}
          </span>
        )}
        {pace.percent !== null && (
          <span className="ml-auto text-[17px] font-semibold tabular-nums">
            {Math.round(pace.percent)}%
          </span>
        )}
      </div>
      {goal.target ? (
        <>
          <ProgressBar pace={pace} large />
          <Pace pace={pace} unit={goal.unit} />
        </>
      ) : (
        <p className="text-label-secondary text-[13px]">Sem meta definida.</p>
      )}
      {editing && (
        <GoalDialog
          title={`Meta: ${goal.label}`}
          description="Vale a partir deste mês e continua nos próximos até você mudar."
          fields={[{ key: 'target', label: 'Meta do mês', unit: goal.unit, value: goal.target }]}
          onClose={() => setEditing(false)}
          onSave={(values) =>
            setCompanyGoalAction({ metric: goal.metric, target: values.target }).then(unwrapResult)
          }
        />
      )}
    </article>
  );
}

function ProfessionalCard({
  pro,
  data,
  isAdmin,
  rank,
  highlight,
}: {
  pro: ProfessionalGoalView;
  data: GoalsOverview;
  isAdmin: boolean;
  rank?: number | null;
  highlight?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const rows = [
    { key: 'revenue' as const, label: 'Produção', unit: 'R$' as const, ...pro.revenue },
    {
      key: 'appointments' as const,
      label: 'Atendimentos',
      unit: 'n' as const,
      ...pro.appointments,
    },
  ];
  const hasAny = rows.some((r) => r.target);
  return (
    <article
      className={cn(
        'bg-tile flex flex-col gap-4 rounded-[22px] p-4 md:p-5',
        highlight && 'ring-system-blue/30 ring-2',
      )}
    >
      <div className="flex items-center gap-3">
        <InitialsAvatar
          name={pro.name}
          color={pro.color}
          imageUrl={pro.avatarUrl}
          className="size-11 text-[14px]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[17px] font-semibold">{pro.name}</span>
            {rank === 1 && (
              <TrophyIcon className="size-4 shrink-0 text-[#ff9f0a]" aria-label="1º lugar" />
            )}
            {rank && rank > 1 && (
              <span className="text-label-secondary text-[12px] font-medium">{rank}º</span>
            )}
          </div>
          {!hasAny && <span className="text-label-secondary text-[13px]">Sem meta definida</span>}
        </div>
        {isAdmin && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <PencilIcon className="size-3.5" /> {hasAny ? 'Mudar' : 'Definir'}
          </Button>
        )}
      </div>
      {rows.map((row) => {
        const pace = goalPace({
          target: row.target,
          actual: row.actual,
          dayOfMonth: data.dayOfMonth,
          totalDays: data.totalDays,
        });
        return (
          <div key={row.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 text-[14px]">
              <span className="text-label-secondary">{row.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{fmt(row.unit, row.actual)}</span>
                {row.target && (
                  <span className="text-label-secondary"> de {fmt(row.unit, row.target)}</span>
                )}
                {pace.percent !== null && (
                  <span className="ml-2 font-semibold">{Math.round(pace.percent)}%</span>
                )}
              </span>
            </div>
            {row.target ? (
              <>
                <ProgressBar pace={pace} large={highlight} />
                <Pace pace={pace} unit={row.unit} />
              </>
            ) : null}
          </div>
        );
      })}
      {editing && (
        <GoalDialog
          title={`Metas de ${pro.name}`}
          description="Valem todo mês até você mudar. Produção é o que foi cobrado pelos serviços dele."
          fields={[
            {
              key: 'revenue',
              label: 'Produção no mês (R$)',
              unit: 'R$',
              value: pro.revenue.target,
            },
            {
              key: 'appointments',
              label: 'Atendimentos concluídos no mês',
              unit: 'n',
              value: pro.appointments.target,
            },
          ]}
          onClose={() => setEditing(false)}
          onSave={(values) =>
            setProfessionalGoalsAction({
              professionalId: pro.id,
              revenue: values.revenue,
              appointments: values.appointments === null ? null : Math.round(values.appointments),
            }).then(unwrapResult)
          }
        />
      )}
    </article>
  );
}

function GoalDialog({
  title,
  description,
  fields,
  onClose,
  onSave,
}: {
  title: string;
  description: string;
  fields: { key: string; label: string; unit: 'R$' | 'n'; value: number | null }[];
  onClose: () => void;
  onSave: (values: Record<string, number | null>) => Promise<unknown>;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((f) => [f.key, f.value ? String(f.value).replace('.', ',') : '']),
    ),
  );
  const save = useMutation({
    mutationFn: () =>
      onSave(Object.fromEntries(fields.map((f) => [f.key, parseNumber(values[f.key] ?? '')]))),
    onSuccess: () => {
      toast.success('Meta salva.');
      onClose();
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`goal-${f.key}`}>{f.label}</Label>
              <Input
                id={`goal-${f.key}`}
                inputMode={f.unit === 'R$' ? 'decimal' : 'numeric'}
                placeholder={f.unit === 'R$' ? 'Ex.: 15.000' : 'Ex.: 120'}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <p className="text-label-secondary text-[12px]">Deixe em branco para ficar sem meta.</p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Salvando...' : 'Salvar meta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
