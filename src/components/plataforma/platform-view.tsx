'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BuildingIcon,
  GiftIcon,
  HourglassIcon,
  RefreshCwIcon,
  SearchIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { formatCurrencyBRL } from '@/lib/serialize';
import { unwrapResult } from '@/lib/action-result';
import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { AnimatedNumber, type NumberFormat } from '@/components/dashboard/animated-number';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { grantCourtesyAction, revokeCourtesyAction } from '@/server/actions/platform-actions';
import type { CompanySituation, CustomerBilling } from '@/server/platform/overview';

export type PlatformCompany = {
  id: string;
  name: string;
  createdAt: string;
  situation: CompanySituation;
  planName: string | null;
  until: string | null;
  clients: number;
  appointments30d: number;
  courtesy: { until: string; planId: string; planName: string; note: string | null } | null;
  billing: CustomerBilling | null;
};

export type PlatformData = {
  generatedAt: string;
  summary: {
    total: number;
    counts: Record<CompanySituation, number>;
    mrr: number;
    newLast7: number;
    newLast30: number;
  };
  endingSoon: { id: string; name: string; trialEndsAt: string | null; daysLeft: number }[];
  revenue: {
    thisMonth: { count: number; gross: number; net: number };
    lastMonth: { count: number; gross: number; net: number };
    allTime: { count: number; gross: number; net: number };
    pending: { count: number; total: number };
    overdue: { count: number; total: number };
    balance: number;
  } | null;
  companies: PlatformCompany[];
  users: {
    total: number;
    latest: {
      id: string;
      name: string | null;
      email: string | null;
      createdAt: string;
      lastSignInAt: string | null;
    }[];
  } | null;
  plans: { id: string; name: string; price: number }[];
  situationLabels: Record<CompanySituation, string>;
};

type Tab = 'overview' | 'billing' | 'companies' | 'trials' | 'users';

const SITUATION_STYLE: Record<CompanySituation, { dot: string; pill: string }> = {
  paying: { dot: 'bg-system-green', pill: 'bg-system-green/12 text-system-green' },
  courtesy: { dot: 'bg-system-indigo', pill: 'bg-system-indigo/12 text-system-indigo' },
  past_due: { dot: 'bg-system-orange', pill: 'bg-system-orange/15 text-system-orange' },
  canceled: { dot: 'bg-foreground/30', pill: 'bg-foreground/[0.06] text-label-secondary' },
  trial: { dot: 'bg-system-blue', pill: 'bg-system-blue/12 text-system-blue' },
  trial_pending: { dot: 'bg-system-blue/50', pill: 'bg-system-blue/[0.07] text-system-blue' },
  trial_ended: { dot: 'bg-system-red', pill: 'bg-system-red/12 text-system-red' },
};

const dateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});
const fmtDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—');
/** Datas da Asaas vêm como "2026-12-15" (sem hora): mostra sem passar por fuso. */
const fmtDay = (ymd: string | null) => (ymd ? ymd.split('-').reverse().join('/') : '—');
const money = formatCurrencyBRL;
const farFuture = (iso: string) => new Date(iso).getUTCFullYear() >= 2099;

function SituationPill({ situation, label }: { situation: CompanySituation; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap',
        SITUATION_STYLE[situation].pill,
      )}
    >
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  format,
  hint,
  index,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  format: NumberFormat;
  hint?: string;
  index: number;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: string;
}) {
  return (
    <AppleTile index={index} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <TileEyebrow>{label}</TileEyebrow>
        {Icon && <Icon className={cn('size-4', tone ?? 'text-label-secondary')} />}
      </div>
      <AnimatedNumber
        value={value}
        format={format}
        className="text-[26px] leading-tight font-semibold tracking-[-0.02em] tabular-nums md:text-[30px]"
      />
      {hint && <span className="text-label-secondary text-[12px] leading-snug">{hint}</span>}
    </AppleTile>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{title}</h2>
      {subtitle && <p className="text-label-secondary text-[13px]">{subtitle}</p>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="bg-tile text-label-secondary rounded-[22px] p-5 text-center text-[14px]">
      {children}
    </p>
  );
}

/**
 * Lista que é tabela no computador e cartões no celular. `cells` vira as colunas; no celular,
 * cada célula aparece como "rótulo: valor" abaixo do título.
 */
function DataList<T>({
  rows,
  rowKey,
  title,
  titleLabel = 'Empresa',
  columns,
  actions,
}: {
  rows: T[];
  rowKey: (row: T) => string;
  title: (row: T) => React.ReactNode;
  titleLabel?: string;
  columns: { label: string; cell: (row: T) => React.ReactNode; align?: 'right' }[];
  actions?: (row: T) => React.ReactNode;
}) {
  return (
    <>
      <div className="bg-tile hidden overflow-x-auto rounded-[22px] md:block">
        <table className="w-full text-left text-[13px]">
          <thead className="text-label-secondary">
            <tr>
              <th className="px-5 py-3 font-medium">{titleLabel}</th>
              {columns.map((c) => (
                <th
                  key={c.label}
                  className={cn('px-4 py-3 font-medium whitespace-nowrap', c.align && 'text-right')}
                >
                  {c.label}
                </th>
              ))}
              {actions && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-foreground/[0.06] divide-y">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-foreground/[0.025] transition-colors">
                <td className="px-5 py-3 font-medium">{title(row)}</td>
                {columns.map((c) => (
                  <td
                    key={c.label}
                    className={cn(
                      'px-4 py-3 whitespace-nowrap',
                      c.align && 'text-right tabular-nums',
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-2 text-right whitespace-nowrap">{actions(row)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <div key={rowKey(row)} className="bg-tile flex flex-col gap-2 rounded-[20px] p-4">
            <div className="text-[15px] font-semibold">{title(row)}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
              {columns.map((c) => (
                <div key={c.label} className="flex flex-col">
                  <dt className="text-label-secondary text-[11px]">{c.label}</dt>
                  <dd className="tabular-nums">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
            {actions && <div className="flex flex-wrap gap-2 pt-1">{actions(row)}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

// ---- Cortesia ------------------------------------------------------------------------------

type Duration = '1m' | '3m' | '12m' | 'none' | 'date';

function CourtesyDialog({
  company,
  plans,
  today,
  onClose,
}: {
  company: PlatformCompany | null;
  plans: PlatformData['plans'];
  /** Data de referência (a da página), para calcular "1 mês", "3 meses"... */
  today: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={company !== null} onOpenChange={(open: boolean) => !open && onClose()}>
      {company && (
        // Remonta por empresa: o formulário começa com a cortesia atual dela.
        <CourtesyForm
          key={company.id}
          company={company}
          plans={plans}
          today={today}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function CourtesyForm({
  company,
  plans,
  today,
  onClose,
}: {
  company: PlatformCompany;
  plans: PlatformData['plans'];
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [plan, setPlan] = React.useState(company.courtesy?.planId ?? 'profissional');
  const [duration, setDuration] = React.useState<Duration>(
    company.courtesy && farFuture(company.courtesy.until) ? 'none' : '1m',
  );
  const [customDate, setCustomDate] = React.useState('');
  const [note, setNote] = React.useState(company.courtesy?.note ?? '');

  const until = (() => {
    if (duration === 'none') return null;
    if (duration === 'date') return customDate || null;
    const months = duration === '1m' ? 1 : duration === '3m' ? 3 : 12;
    const d = new Date(today);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  })();

  const grant = useMutation({
    mutationFn: () =>
      grantCourtesyAction({ companyId: company.id, plan, until, note }).then(unwrapResult),
    onSuccess: () => {
      toast.success(`Cortesia liberada para ${company.name}.`);
      onClose();
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Acesso grátis (cortesia)</DialogTitle>
        <DialogDescription>
          {company.name} usa o plano escolhido sem pagar até a data. Não gera cobrança; dá para
          tirar quando quiser.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="text-label-secondary">Plano</span>
          <SegmentedControl
            value={plan}
            onValueChange={setPlan}
            options={plans.map((p) => ({ value: p.id, label: p.name }))}
          />
        </label>
        <div className="flex flex-col gap-1.5 text-[13px]">
          <span className="text-label-secondary">Por quanto tempo</span>
          <SegmentedControl
            size="sm"
            value={duration}
            onValueChange={setDuration}
            options={[
              { value: '1m', label: '1 mês' },
              { value: '3m', label: '3 meses' },
              { value: '12m', label: '1 ano' },
              { value: 'none', label: 'Sem prazo' },
              { value: 'date', label: 'Data' },
            ]}
          />
          {duration === 'date' && (
            <Input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              aria-label="Até quando"
            />
          )}
          <span className="text-label-secondary text-[12px]">
            {until
              ? `Até ${fmtDay(until)}.`
              : duration === 'none'
                ? 'Sem data para acabar.'
                : 'Escolha a data.'}
          </span>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="text-label-secondary">Motivo (só você vê)</span>
          <Input
            value={note}
            maxLength={300}
            placeholder="Ex.: parceiro, influenciador, cliente piloto"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={grant.isPending || (duration === 'date' && !customDate)}
          onClick={() => grant.mutate()}
        >
          {grant.isPending ? 'Liberando...' : 'Liberar acesso'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ---- Tela ----------------------------------------------------------------------------------

/** Painel do dono do Atendafy, separado por tópicos. Dados já calculados no servidor. */
export function PlatformView({ data }: { data: PlatformData }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>('overview');
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<CompanySituation | 'all'>('all');
  const [courtesyFor, setCourtesyFor] = React.useState<PlatformCompany | null>(null);
  const [refreshing, startRefresh] = React.useTransition();
  const { summary, revenue, companies, users, situationLabels: labels } = data;

  const revoke = useMutation({
    mutationFn: (companyId: string) => revokeCourtesyAction({ companyId }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Cortesia removida.');
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const subscribers = summary.counts.paying + summary.counts.past_due;
  const conversion = summary.total ? (subscribers / summary.total) * 100 : 0;
  const situations = Object.keys(labels) as CompanySituation[];

  const shownCompanies = companies.filter(
    (c) =>
      (filter === 'all' || c.situation === filter) &&
      c.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const billed = [...companies]
    .filter((c) => c.billing)
    .sort((a, b) => (b.billing?.paid ?? 0) - (a.billing?.paid ?? 0));
  const pendingTrial = companies.filter((c) => c.situation === 'trial_pending');
  const endedTrial = companies.filter((c) => c.situation === 'trial_ended');

  const go = (next: Tab, nextFilter?: CompanySituation) => {
    setTab(next);
    if (nextFilter) setFilter(nextFilter);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const courtesyActions = (c: PlatformCompany) =>
    c.courtesy ? (
      <span className="inline-flex gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setCourtesyFor(c)}>
          Editar cortesia
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={revoke.isPending}
          onClick={() => revoke.mutate(c.id)}
        >
          Remover
        </Button>
      </span>
    ) : (
      <Button size="sm" variant="outline" onClick={() => setCourtesyFor(c)}>
        <GiftIcon className="size-3.5" /> Dar acesso grátis
      </Button>
    );

  return (
    <main className="font-apple mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:gap-8 md:px-8 md:py-10">
      {/* Cabeçalho com efeito de vidro, fixo ao rolar */}
      <header className="bg-background/70 sticky top-0 z-20 -mx-4 flex flex-col gap-4 px-4 pt-2 pb-3 backdrop-blur-xl md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link
              href="/dashboard"
              className="text-system-blue mb-1 inline-flex items-center gap-1 text-[13px] font-medium"
            >
              <ArrowLeftIcon className="size-3.5" /> Painel
            </Link>
            <h1 className="text-[30px] leading-tight font-bold tracking-[-0.03em] md:text-[36px]">
              Plataforma
            </h1>
            <p className="text-label-secondary text-[13px]">
              Visão do Atendafy inteiro. Só você vê esta página · atualizado{' '}
              {dateTimeFmt.format(new Date(data.generatedAt))}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => startRefresh(() => router.refresh())}
          >
            <RefreshCwIcon className={cn('size-3.5', refreshing && 'animate-spin')} /> Atualizar
          </Button>
        </div>
        <SegmentedControl
          className="self-start"
          value={tab}
          onValueChange={setTab}
          options={[
            { value: 'overview', label: 'Visão geral' },
            { value: 'billing', label: 'Faturamento' },
            { value: 'companies', label: 'Empresas' },
            { value: 'trials', label: 'Testes' },
            { value: 'users', label: 'Usuários' },
          ]}
        />
      </header>

      {tab === 'overview' && (
        <div key="overview" className="flex flex-col gap-6 md:gap-8">
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <Stat
              index={0}
              label="Receita recorrente"
              value={summary.mrr}
              format="currency"
              hint="Soma mensal dos planos de quem paga"
              icon={WalletIcon}
              tone="text-system-green"
            />
            <Stat
              index={1}
              label="Recebido no mês"
              value={revenue?.thisMonth.gross ?? 0}
              format="currency"
              hint={revenue ? `${revenue.thisMonth.count} pagamento(s)` : 'Asaas indisponível'}
            />
            <Stat
              index={2}
              label="Empresas"
              value={summary.total}
              format="integer"
              hint={`+${summary.newLast7} em 7 dias · +${summary.newLast30} em 30`}
              icon={BuildingIcon}
            />
            <Stat
              index={3}
              label="Conversão"
              value={conversion}
              format="percent"
              hint={`${subscribers} assinante(s)`}
            />
          </div>

          <div className="grid gap-3 md:gap-4 lg:grid-cols-[1.4fr_1fr]">
            <AppleTile index={4} interactive={false} className="flex flex-col gap-4">
              <SectionTitle title="Situação das empresas" subtitle="Toque para ver a lista" />
              <ul className="flex flex-col gap-1">
                {situations.map((s) => {
                  const count = summary.counts[s];
                  const share = summary.total ? (count / summary.total) * 100 : 0;
                  return (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => go('companies', s)}
                        className="hover:bg-foreground/[0.04] flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors"
                      >
                        <span
                          className={cn('size-2.5 shrink-0 rounded-full', SITUATION_STYLE[s].dot)}
                        />
                        <span className="w-36 shrink-0 text-[14px]">{labels[s]}</span>
                        <span className="bg-foreground/[0.06] h-1.5 flex-1 overflow-hidden rounded-full">
                          <span
                            className={cn('block h-full rounded-full', SITUATION_STYLE[s].dot)}
                            style={{ width: `${share}%` }}
                          />
                        </span>
                        <span className="w-8 text-right text-[14px] font-semibold tabular-nums">
                          {count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </AppleTile>

            <div className="flex flex-col gap-3 md:gap-4">
              {[
                {
                  show: data.endingSoon.length > 0,
                  icon: HourglassIcon,
                  tone: 'text-system-blue',
                  text: `${data.endingSoon.length} teste(s) acabam em até 7 dias`,
                  onClick: () => go('trials'),
                },
                {
                  show: summary.counts.past_due > 0,
                  icon: AlertTriangleIcon,
                  tone: 'text-system-orange',
                  text: `${summary.counts.past_due} empresa(s) com pagamento atrasado`,
                  onClick: () => go('companies', 'past_due'),
                },
                {
                  show: summary.counts.trial_ended > 0,
                  icon: AlertTriangleIcon,
                  tone: 'text-system-red',
                  text: `${summary.counts.trial_ended} teste(s) acabaram sem assinar`,
                  onClick: () => go('trials'),
                },
                {
                  show: summary.counts.trial_pending > 0,
                  icon: GiftIcon,
                  tone: 'text-system-indigo',
                  text: `${summary.counts.trial_pending} conta(s) ainda não liberaram o teste grátis`,
                  onClick: () => go('trials'),
                },
              ]
                .filter((a) => a.show)
                .map((a, i) => (
                  <button key={a.text} type="button" onClick={a.onClick} className="text-left">
                    <AppleTile index={5 + i} className="flex items-center gap-3">
                      <a.icon className={cn('size-5 shrink-0', a.tone)} />
                      <span className="text-[14px] font-medium">{a.text}</span>
                      <span className="text-label-secondary ml-auto text-[13px]">Ver →</span>
                    </AppleTile>
                  </button>
                ))}
              {data.endingSoon.length === 0 &&
                summary.counts.past_due === 0 &&
                summary.counts.trial_ended === 0 &&
                summary.counts.trial_pending === 0 && (
                  <AppleTile index={5} interactive={false}>
                    <TileEyebrow>Tudo em ordem</TileEyebrow>
                    <p className="mt-1 text-[14px]">Nenhum alerta agora.</p>
                  </AppleTile>
                )}
            </div>
          </div>
        </div>
      )}

      {tab === 'billing' && (
        <div key="billing" className="flex flex-col gap-6 md:gap-8">
          {revenue ? (
            <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
              <Stat
                index={0}
                label="Receita recorrente"
                value={summary.mrr}
                format="currency"
                hint="Planos de quem paga, por mês"
                icon={WalletIcon}
                tone="text-system-green"
              />
              <Stat
                index={1}
                label="Recebido no mês"
                value={revenue.thisMonth.gross}
                format="currency"
                hint={`Líquido ${money(revenue.thisMonth.net)}`}
              />
              <Stat
                index={2}
                label="Mês passado"
                value={revenue.lastMonth.gross}
                format="currency"
                hint={`${revenue.lastMonth.count} pagamento(s)`}
              />
              <Stat
                index={3}
                label="Total já recebido"
                value={revenue.allTime.gross}
                format="currency"
                hint={`Líquido ${money(revenue.allTime.net)}`}
              />
              <Stat
                index={4}
                label="A receber"
                value={revenue.pending.total}
                format="currency"
                hint={`${revenue.pending.count} cobrança(s) em aberto`}
              />
              <Stat
                index={5}
                label="Atrasado"
                value={revenue.overdue.total}
                format="currency"
                hint={`${revenue.overdue.count} cobrança(s) vencida(s)`}
                tone="text-system-orange"
                icon={AlertTriangleIcon}
              />
              <Stat
                index={6}
                label="Saldo na Asaas"
                value={revenue.balance}
                format="currency"
                hint="Disponível para saque"
              />
              <Stat
                index={7}
                label="Assinantes"
                value={subscribers}
                format="integer"
                hint={`${summary.counts.courtesy} em cortesia (fora da conta)`}
              />
            </div>
          ) : (
            <Empty>
              Não foi possível consultar a Asaas agora (ou a chave não está configurada). Receita
              recorrente estimada: {money(summary.mrr)}.
            </Empty>
          )}

          <SectionTitle
            title="Faturamento por empresa"
            subtitle="Quanto cada empresa já pagou ao Atendafy, o que está em aberto e o próximo vencimento."
          />
          {billed.length ? (
            <DataList
              rows={billed}
              rowKey={(c) => c.id}
              title={(c) => c.name}
              columns={[
                {
                  label: 'Situação',
                  cell: (c) => (
                    <SituationPill situation={c.situation} label={labels[c.situation]} />
                  ),
                },
                { label: 'Plano', cell: (c) => c.planName ?? '—' },
                { label: 'Total pago', cell: (c) => money(c.billing!.paid), align: 'right' },
                { label: 'Pagamentos', cell: (c) => c.billing!.paidCount, align: 'right' },
                { label: 'Último pagamento', cell: (c) => fmtDay(c.billing!.lastPaidAt) },
                {
                  label: 'Em aberto',
                  cell: (c) =>
                    c.billing!.overdue > 0 ? (
                      <span className="text-system-orange">
                        {money(c.billing!.open + c.billing!.overdue)}
                      </span>
                    ) : (
                      money(c.billing!.open)
                    ),
                  align: 'right',
                },
                { label: 'Próximo vencimento', cell: (c) => fmtDay(c.billing!.nextDueDate) },
              ]}
            />
          ) : (
            <Empty>Nenhuma empresa assinou ainda.</Empty>
          )}
        </div>
      )}

      {tab === 'companies' && (
        <div key="companies" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative md:w-72">
              <SearchIcon className="text-label-secondary pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                className="pl-9"
                placeholder="Buscar empresa"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
              {(['all', ...situations] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
                    filter === s
                      ? 'bg-foreground text-background'
                      : 'bg-foreground/[0.06] hover:bg-foreground/10',
                  )}
                >
                  {s === 'all'
                    ? `Todas (${companies.length})`
                    : `${labels[s]} (${summary.counts[s]})`}
                </button>
              ))}
            </div>
          </div>
          {shownCompanies.length ? (
            <DataList
              rows={shownCompanies}
              rowKey={(c) => c.id}
              title={(c) => (
                <span className="flex flex-col">
                  {c.name}
                  {c.courtesy && (
                    <span className="text-system-indigo text-[12px] font-normal">
                      Cortesia {c.courtesy.planName} ·{' '}
                      {farFuture(c.courtesy.until)
                        ? 'sem prazo'
                        : `até ${fmtDate(c.courtesy.until)}`}
                      {c.courtesy.note ? ` · ${c.courtesy.note}` : ''}
                    </span>
                  )}
                </span>
              )}
              columns={[
                {
                  label: 'Situação',
                  cell: (c) => (
                    <SituationPill situation={c.situation} label={labels[c.situation]} />
                  ),
                },
                { label: 'Criada em', cell: (c) => fmtDate(c.createdAt) },
                { label: 'Plano', cell: (c) => c.planName ?? '—' },
                { label: 'Teste / período até', cell: (c) => fmtDate(c.until) },
                { label: 'Clientes', cell: (c) => c.clients, align: 'right' },
                { label: 'Atendimentos (30 dias)', cell: (c) => c.appointments30d, align: 'right' },
              ]}
              actions={courtesyActions}
            />
          ) : (
            <Empty>Nenhuma empresa com esse filtro.</Empty>
          )}
        </div>
      )}

      {tab === 'trials' && (
        <div key="trials" className="flex flex-col gap-6 md:gap-8">
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <Stat index={0} label="Em teste" value={summary.counts.trial} format="integer" />
            <Stat
              index={1}
              label="Acabam em 7 dias"
              value={data.endingSoon.length}
              format="integer"
              icon={HourglassIcon}
              tone="text-system-blue"
            />
            <Stat
              index={2}
              label="Teste a liberar"
              value={summary.counts.trial_pending}
              format="integer"
            />
            <Stat
              index={3}
              label="Acabou sem assinar"
              value={summary.counts.trial_ended}
              format="integer"
              tone="text-system-red"
              icon={AlertTriangleIcon}
            />
          </div>

          <SectionTitle
            title="Acabam em até 7 dias"
            subtitle="Boa hora para chamar no WhatsApp e ajudar a assinar."
          />
          {data.endingSoon.length ? (
            <DataList
              rows={data.endingSoon}
              rowKey={(c) => c.id}
              title={(c) => c.name}
              columns={[
                {
                  label: 'Faltam',
                  cell: (c) => `${c.daysLeft} ${c.daysLeft === 1 ? 'dia' : 'dias'}`,
                },
                { label: 'Fim do teste', cell: (c) => fmtDate(c.trialEndsAt) },
              ]}
            />
          ) : (
            <Empty>Nenhum teste acabando nos próximos 7 dias.</Empty>
          )}

          <SectionTitle
            title="Ainda não liberaram o teste grátis"
            subtitle="Criaram a conta, mas não informaram CPF/CNPJ e celular."
          />
          {pendingTrial.length ? (
            <DataList
              rows={pendingTrial}
              rowKey={(c) => c.id}
              title={(c) => c.name}
              columns={[{ label: 'Criada em', cell: (c) => fmtDate(c.createdAt) }]}
              actions={courtesyActions}
            />
          ) : (
            <Empty>Ninguém esperando para liberar.</Empty>
          )}

          <SectionTitle title="Teste acabou sem assinar" />
          {endedTrial.length ? (
            <DataList
              rows={endedTrial}
              rowKey={(c) => c.id}
              title={(c) => c.name}
              columns={[
                { label: 'Criada em', cell: (c) => fmtDate(c.createdAt) },
                { label: 'Teste até', cell: (c) => fmtDate(c.until) },
                { label: 'Clientes', cell: (c) => c.clients, align: 'right' },
              ]}
              actions={courtesyActions}
            />
          ) : (
            <Empty>Nenhum teste acabado sem assinatura.</Empty>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div key="users" className="flex flex-col gap-6 md:gap-8">
          {users ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
                <Stat
                  index={0}
                  label="Contas criadas"
                  value={users.total}
                  format="integer"
                  icon={UsersIcon}
                />
                <Stat
                  index={1}
                  label="Novas em 7 dias"
                  value={
                    users.latest.filter(
                      (u) =>
                        Date.parse(data.generatedAt) - Date.parse(u.createdAt) < 7 * 86_400_000,
                    ).length
                  }
                  format="integer"
                  hint="Entre as 30 mais recentes"
                />
              </div>
              <SectionTitle title="Últimos cadastros" />
              <DataList
                rows={users.latest}
                rowKey={(u) => u.id}
                title={(u) => u.name ?? u.email ?? 'Sem nome'}
                titleLabel="Nome"
                columns={[
                  { label: 'E-mail', cell: (u) => u.email ?? '—' },
                  { label: 'Cadastro', cell: (u) => dateTimeFmt.format(new Date(u.createdAt)) },
                  {
                    label: 'Último acesso',
                    cell: (u) =>
                      u.lastSignInAt ? dateTimeFmt.format(new Date(u.lastSignInAt)) : '—',
                  },
                ]}
              />
            </>
          ) : (
            <Empty>Não foi possível consultar o Clerk agora.</Empty>
          )}
        </div>
      )}

      <CourtesyDialog
        company={courtesyFor}
        plans={data.plans}
        today={data.generatedAt}
        onClose={() => setCourtesyFor(null)}
      />
    </main>
  );
}
