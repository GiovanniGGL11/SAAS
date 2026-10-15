import Link from 'next/link';
import { HistoryIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { requireAdminPage } from '@/server/auth/require-current-company';
import { listAuditHistory } from '@/server/data/audit-history';
import { PageHeader } from '@/components/layout/page';

export const metadata = { title: 'Histórico' };

const PERIODS = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
] as const;

const TYPES = [
  { value: '', label: 'Tudo' },
  { value: 'Appointment', label: 'Agendamentos' },
  { value: 'Client', label: 'Clientes' },
  { value: 'Service', label: 'Serviços' },
  { value: 'Product', label: 'Estoque' },
  { value: 'ScheduleBlock', label: 'Bloqueios' },
] as const;

/** Quem mudou o quê, e quando: horários, cobranças, cancelamentos e cadastros. Só para o dono. */
export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; tipo?: string; antes?: string }>;
}) {
  const { company } = await requireAdminPage();
  const params = await searchParams;
  const days = PERIODS.some((p) => p.value === params.dias) ? Number(params.dias) : 30;
  const type = TYPES.some((t) => t.value === params.tipo) ? (params.tipo ?? '') : '';
  const before = params.antes ? new Date(params.antes) : undefined;

  const { entries, nextBefore } = await listAuditHistory(company.id, company.timezone, {
    days,
    before: before && !Number.isNaN(before.getTime()) ? before : undefined,
    entityType: type || undefined,
  });

  const query = (next: Record<string, string | undefined>) => {
    const merged = { dias: String(days), tipo: type, ...next };
    const search = new URLSearchParams(
      Object.entries(merged).filter((e): e is [string, string] => Boolean(e[1])),
    );
    return `/historico?${search.toString()}`;
  };

  const dayLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone: company.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeLabel = new Intl.DateTimeFormat('pt-BR', {
    timeZone: company.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  // Agrupa por dia, mantendo a ordem (do mais novo para o mais antigo).
  const groups: { day: string; items: typeof entries }[] = [];
  for (const entry of entries) {
    const day = dayLabel.format(entry.createdAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(entry);
    else groups.push({ day, items: [entry] });
  }

  const pill = (active: boolean) =>
    cn(
      'rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
      active ? 'bg-foreground text-background' : 'bg-foreground/[0.06] hover:bg-foreground/[0.1]',
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Histórico"
        description="Quem mudou horários, cobranças, cancelamentos e cadastros, e quando."
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={query({ dias: p.value })}
              className={pill(String(days) === p.value)}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <div className="-mx-4 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {TYPES.map((t) => (
            <Link
              key={t.value || 'all'}
              href={query({ tipo: t.value || undefined })}
              className={cn(pill(type === t.value), 'shrink-0')}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="bg-tile flex flex-col items-center gap-2 rounded-[22px] px-6 py-12 text-center">
          <HistoryIcon className="text-label-secondary size-8" />
          <p className="text-[15px] font-medium">Nada registrado neste período</p>
          <p className="text-label-secondary text-[13px]">
            Alterações em agendamentos, cobranças e cadastros aparecem aqui.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.day} className="flex flex-col gap-2">
            <h2 className="text-label-secondary px-1 text-[13px] font-medium first-letter:uppercase">
              {group.day}
            </h2>
            <ul className="bg-tile divide-foreground/[0.06] divide-y overflow-hidden rounded-[22px]">
              {group.items.map((entry) => (
                <li key={entry.id} className="flex gap-3 px-4 py-3">
                  <span className="text-label-secondary w-11 shrink-0 pt-0.5 text-[13px] tabular-nums">
                    {timeLabel.format(entry.createdAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium">{entry.title}</div>
                    {entry.subject &&
                      (entry.href ? (
                        <Link
                          href={entry.href}
                          className="text-system-blue block truncate text-[13px] hover:underline"
                        >
                          {entry.subject}
                        </Link>
                      ) : (
                        <div className="text-label-secondary truncate text-[13px]">
                          {entry.subject}
                        </div>
                      ))}
                    {entry.detail && (
                      <div className="text-label-secondary text-[13px]">{entry.detail}</div>
                    )}
                    <div className="text-label-secondary mt-0.5 text-[12px]">por {entry.actor}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {nextBefore && (
        <Link
          href={query({ antes: nextBefore })}
          className="bg-foreground/[0.06] hover:bg-foreground/[0.1] self-center rounded-full px-4 py-2 text-[13px] font-medium"
        >
          Ver mais antigos
        </Link>
      )}
    </div>
  );
}
