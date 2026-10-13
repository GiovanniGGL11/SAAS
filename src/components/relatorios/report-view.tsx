'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import {
  BanIcon,
  BarChart3Icon,
  CircleCheckIcon,
  DownloadIcon,
  UserXIcon,
  WalletIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatTile } from '@/components/dashboard/stat-tile';
import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { PageHeader } from '@/components/layout/page';
import { getReportAction } from '@/server/actions/report-actions';
import { REPORT_PRESETS, type ReportPreset } from '@/lib/validations/report';
import { formatCurrencyBRL } from '@/lib/serialize';

type ReportData = Awaited<ReturnType<typeof getReportAction>>;

const formatPercent = (value: number) =>
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Builds a semicolon-separated CSV (Excel pt-BR friendly) and triggers a download. */
function downloadCsv(data: ReportData, presetLabel: string) {
  const money = (value: number) => value.toFixed(2).replace('.', ',');
  const rows: string[][] = [
    ['Relatório', presetLabel],
    [],
    [
      'Profissional',
      'Atendimentos',
      'Ticket médio',
      'Faturamento',
      'Regra de comissão',
      'Comissão',
    ],
    ...data.byProfessional.map((p) => [
      p.name,
      String(p.count),
      money(p.averageTicket),
      money(p.revenue),
      p.commissionRule ?? '—',
      p.commission === null ? '—' : money(p.commission),
    ]),
    [],
    ['Serviço', 'Vendas', 'Faturamento'],
    ...data.byService.map((s) => [s.name, String(s.count), money(s.revenue)]),
    [],
    ['Dia da semana', 'Faturamento'],
    ...data.byWeekday.map((w) => [w.label, money(w.revenue)]),
    [],
    ['Concluídos', String(data.cancellation.completed)],
    ['Cancelados', String(data.cancellation.canceled)],
    ['Faltas', String(data.cancellation.noShow)],
  ];
  const csv = rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio-${presetLabel.toLowerCase().replace(/\s+/g, '-')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function RankingList({
  items,
  countLabel,
}: {
  items: {
    id: string;
    name: string;
    color: string;
    count: number;
    revenue: number;
    extra?: string;
  }[];
  countLabel: string;
}) {
  const reduceMotion = useReducedMotion();
  const max = Math.max(...items.map((item) => item.revenue), 1);
  const total = items.reduce((sum, item) => sum + item.revenue, 0);

  return (
    <ol className="flex flex-col gap-4">
      {items.map((item, index) => (
        <li key={item.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="text-label-secondary w-4 text-[12px] font-semibold tabular-nums">
                {index + 1}
              </span>
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate text-[14px] font-medium">{item.name}</span>
            </div>
            <span className="shrink-0 text-[14px] font-semibold tabular-nums">
              {formatCurrencyBRL(item.revenue)}
            </span>
          </div>
          <div className="flex items-center gap-3 pl-[26px]">
            <div className="bg-foreground/[0.07] h-1.5 flex-1 overflow-hidden rounded-full">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: item.color }}
                initial={reduceMotion ? false : { width: 0 }}
                animate={{ width: `${(item.revenue / max) * 100}%` }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: index * 0.05 }}
              />
            </div>
            <span className="text-label-secondary w-40 shrink-0 text-right text-[12px] tabular-nums">
              {item.count} {countLabel}
              {item.extra ? ` · ${item.extra}` : ''} ·{' '}
              {total > 0 ? Math.round((item.revenue / total) * 100) : 0}%
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ReportView({ initialData }: { initialData: ReportData }) {
  const reduceMotion = useReducedMotion();
  const [preset, setPreset] = React.useState<ReportPreset>('last30');
  const presetLabel = REPORT_PRESETS.find((p) => p.value === preset)?.label ?? '';

  const { data, isFetching } = useQuery({
    queryKey: ['report', preset],
    queryFn: () => getReportAction({ preset }),
    initialData: preset === 'last30' ? initialData : undefined,
  });

  const maxWeekdayRevenue = Math.max(...(data?.byWeekday.map((w) => w.revenue) ?? [0]), 1);
  const bestWeekday = data?.byWeekday.reduce<(typeof data.byWeekday)[number] | null>(
    (best, w) => (w.revenue > 0 && (!best || w.revenue > best.revenue) ? w : best),
    null,
  );
  const totalRevenue = data?.byProfessional.reduce((sum, p) => sum + p.revenue, 0) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Relatórios"
        description="Detalhamento por profissional, serviço e dia da semana."
        actions={
          <Button
            variant="outline"
            disabled={!data}
            onClick={() => data && downloadCsv(data, presetLabel)}
          >
            <DownloadIcon className="size-4" />
            Exportar CSV
          </Button>
        }
      />

      <SegmentedControl
        value={preset}
        onValueChange={setPreset}
        options={REPORT_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
        className="self-start"
      />

      {!data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-[22px]" />
          ))}
        </div>
      ) : (
        <div className={isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <StatTile
              index={0}
              label="Faturamento no período"
              value={formatCurrencyBRL(totalRevenue)}
              icon={WalletIcon}
              iconColor="var(--system-blue)"
            />
            <StatTile
              index={1}
              label="Atendimentos concluídos"
              value={String(data.cancellation.completed)}
              icon={CircleCheckIcon}
              iconColor="var(--system-green)"
              hint={
                data.cancellation.completed > 0
                  ? `Ticket médio ${formatCurrencyBRL(totalRevenue / data.cancellation.completed)}`
                  : undefined
              }
            />
            <StatTile
              index={2}
              label="Taxa de cancelamento"
              value={formatPercent(data.cancellation.cancellationRate)}
              icon={BanIcon}
              iconColor="#ff9500"
              hint={`${data.cancellation.canceled} cancelados`}
            />
            <StatTile
              index={3}
              label="Taxa de falta (no-show)"
              value={formatPercent(data.cancellation.noShowRate)}
              icon={UserXIcon}
              iconColor="var(--system-red)"
              hint={`${data.cancellation.noShow} faltas`}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AppleTile interactive={false}>
              <TileEyebrow>Faturamento por profissional</TileEyebrow>
              <div className="mt-5">
                {data.byProfessional.length === 0 ? (
                  <EmptyState
                    icon={BarChart3Icon}
                    title="Nenhum atendimento concluído no período"
                    className="py-6"
                  />
                ) : (
                  <RankingList
                    countLabel="atend."
                    items={data.byProfessional.map((p) => ({
                      id: p.professionalId,
                      name: p.name,
                      color: p.color,
                      count: p.count,
                      revenue: p.revenue,
                      extra:
                        p.commission === null
                          ? `ticket ${formatCurrencyBRL(p.averageTicket)}`
                          : `ticket ${formatCurrencyBRL(p.averageTicket)} · comissão ${formatCurrencyBRL(p.commission)}`,
                    }))}
                  />
                )}
              </div>
            </AppleTile>

            <AppleTile interactive={false}>
              <TileEyebrow>Faturamento por serviço</TileEyebrow>
              <div className="mt-5">
                {data.byService.length === 0 ? (
                  <EmptyState
                    icon={BarChart3Icon}
                    title="Nenhum atendimento concluído no período"
                    className="py-6"
                  />
                ) : (
                  <RankingList
                    countLabel="vendas"
                    items={data.byService.map((s) => ({
                      id: s.serviceId,
                      name: s.name,
                      color: s.color,
                      count: s.count,
                      revenue: s.revenue,
                    }))}
                  />
                )}
              </div>
            </AppleTile>
          </div>

          <AppleTile interactive={false} className="mt-4">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
              <div>
                <TileEyebrow>Faturamento por dia da semana</TileEyebrow>
                <div className="mt-1 text-[24px] leading-none font-semibold tracking-[-0.025em]">
                  {bestWeekday ? `Melhor dia: ${bestWeekday.label}` : 'Sem faturamento no período'}
                </div>
              </div>
              <span className="text-label-secondary text-xs">{presetLabel}</span>
            </div>
            <div className="flex h-48 items-end gap-2 sm:gap-4">
              {data.byWeekday.map((w, i) => {
                const pct = (w.revenue / maxWeekdayRevenue) * 100;
                const isBest = bestWeekday?.weekday === w.weekday;
                return (
                  <div
                    key={w.weekday}
                    className="group flex h-full flex-1 flex-col items-center gap-2"
                  >
                    <span className="text-label-secondary text-[11px] font-medium tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
                      {formatCurrencyBRL(w.revenue).replace(',00', '')}
                    </span>
                    <div className="bg-foreground/[0.06] relative flex w-full max-w-12 flex-1 items-end overflow-hidden rounded-full">
                      <motion.div
                        className="w-full origin-bottom rounded-full"
                        style={{
                          height: `${Math.max(pct, w.revenue > 0 ? 6 : 0)}%`,
                          backgroundColor: 'var(--system-blue)',
                          opacity: isBest ? 1 : 0.45,
                        }}
                        initial={reduceMotion ? false : { scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 160,
                          damping: 18,
                          delay: i * 0.05,
                        }}
                      />
                    </div>
                    <span
                      className={
                        isBest ? 'text-[12px] font-semibold' : 'text-label-secondary text-[12px]'
                      }
                    >
                      {w.label.slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </AppleTile>
        </div>
      )}
    </div>
  );
}
