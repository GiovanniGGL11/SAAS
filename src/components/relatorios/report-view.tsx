'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatTile } from '@/components/dashboard/stat-tile';
import { getReportAction } from '@/server/actions/report-actions';
import { REPORT_PRESETS, type ReportPreset } from '@/lib/validations/report';
import { formatCurrencyBRL } from '@/lib/serialize';

type ReportData = Awaited<ReturnType<typeof getReportAction>>;

export function ReportView({ initialData }: { initialData: ReportData }) {
  const [preset, setPreset] = React.useState<ReportPreset>('last30');

  const { data, isFetching } = useQuery({
    queryKey: ['report', preset],
    queryFn: () => getReportAction({ preset }),
    initialData: preset === 'last30' ? initialData : undefined,
  });

  const maxWeekdayRevenue = Math.max(...(data?.byWeekday.map((w) => w.revenue) ?? [0]), 1);
  const totalRevenue = data?.byProfessional.reduce((sum, p) => sum + p.revenue, 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-muted-foreground text-sm">
            Detalhamento por profissional, serviço e dia da semana.
          </p>
        </div>
        <div className="bg-muted flex flex-wrap gap-0.5 rounded-md p-0.5">
          {REPORT_PRESETS.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={preset === p.value ? 'default' : 'ghost'}
              className="h-7"
              onClick={() => setPreset(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {!data ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : (
        <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Faturamento no período" value={formatCurrencyBRL(totalRevenue)} />
            <StatTile label="Atendimentos concluídos" value={String(data.cancellation.completed)} />
            <StatTile
              label="Taxa de cancelamento"
              value={`${data.cancellation.cancellationRate.toFixed(1)}%`}
            />
            <StatTile
              label="Taxa de falta (no-show)"
              value={`${data.cancellation.noShowRate.toFixed(1)}%`}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border p-4">
              <h2 className="mb-3 text-sm font-medium">Faturamento por profissional</h2>
              {data.byProfessional.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nenhum atendimento concluído no período.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Atend.</TableHead>
                      <TableHead>Ticket médio</TableHead>
                      <TableHead>Faturamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byProfessional.map((p) => (
                      <TableRow key={p.professionalId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                            {p.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.count}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatCurrencyBRL(p.averageTicket)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrencyBRL(p.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="rounded-lg border p-4">
              <h2 className="mb-3 text-sm font-medium">Faturamento por serviço</h2>
              {data.byService.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nenhum atendimento concluído no período.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Vendas</TableHead>
                      <TableHead>Faturamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byService.map((s) => (
                      <TableRow key={s.serviceId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: s.color }}
                            />
                            {s.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{s.count}</TableCell>
                        <TableCell className="font-medium">
                          {formatCurrencyBRL(s.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-lg border p-4">
            <h2 className="mb-3 text-sm font-medium">Faturamento por dia da semana</h2>
            <div className="flex flex-col gap-2">
              {data.byWeekday.map((w) => (
                <div key={w.weekday} className="flex items-center gap-3">
                  <span className="text-muted-foreground w-20 shrink-0 text-xs">{w.label}</span>
                  <div className="bg-muted h-5 flex-1 overflow-hidden rounded-[4px]">
                    <div
                      className="bg-chart-1 h-full rounded-[4px]"
                      style={{ width: `${(w.revenue / maxWeekdayRevenue) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs font-medium">
                    {formatCurrencyBRL(w.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {(data.cancellation.canceled > 0 || data.cancellation.noShow > 0) && (
            <div className="mt-4 flex gap-2">
              <Badge variant="outline">{data.cancellation.canceled} cancelados</Badge>
              <Badge variant="outline">{data.cancellation.noShow} faltas</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
