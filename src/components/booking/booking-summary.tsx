'use client';

import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatCurrencyBRL } from '@/lib/serialize';
import {
  addMinutesToLabel,
  formatDuration,
  longDate,
  WEEKDAY_SHORT,
  weekdayOf,
  type DateParts,
} from '@/lib/booking';

export type SummaryData = {
  service: { name: string; durationMinutes: number; price: number } | null;
  /** Quem atende; "Primeiro disponível" enquanto o horário não define. */
  professionalName: string | null;
  date: DateParts | null;
  time: string | null;
  timezoneLabel: string;
};

function EditLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-system-blue rounded text-[13px] font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label={label}
    >
      Alterar
    </button>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-[14px]">
      <dt className="text-label-secondary shrink-0">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}

/**
 * Resumo da reserva: só o que já foi escolhido, nada inventado. "Alterar" volta à etapa certa
 * sem perder o resto. No computador fica na coluna lateral; no celular vira um cartão compacto.
 */
export function BookingSummary({
  data,
  onEditService,
  onEditTime,
  variant,
}: {
  data: SummaryData;
  onEditService: () => void;
  onEditTime: () => void;
  variant: 'full' | 'compact';
}) {
  const [expanded, setExpanded] = React.useState(false);
  const { service, professionalName, date, time } = data;
  const end = service && time ? addMinutesToLabel(time, service.durationMinutes) : null;

  const details = (
    <dl className="divide-foreground/[0.06] divide-y">
      {service && (
        <div className="py-2">
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <dt className="text-label-secondary">Serviço</dt>
            <EditLink onClick={onEditService} label="Alterar serviço ou profissional" />
          </div>
          <dd className="mt-0.5 text-[15px] font-semibold">{service.name}</dd>
          {professionalName && (
            <dd className="text-label-secondary text-[14px]">com {professionalName}</dd>
          )}
        </div>
      )}
      {date && time && (
        <div className="py-2">
          <div className="flex items-baseline justify-between gap-3 text-[14px]">
            <dt className="text-label-secondary">Data e horário</dt>
            <EditLink onClick={onEditTime} label="Alterar data ou horário" />
          </div>
          <dd className="mt-0.5 text-[15px] font-semibold first-letter:uppercase">
            {longDate(date)}
          </dd>
          <dd className="text-[14px] tabular-nums">
            {time} – {end}
            <span className="text-label-secondary"> · {data.timezoneLabel}</span>
          </dd>
        </div>
      )}
      {service && <Row label="Duração" value={formatDuration(service.durationMinutes)} />}
      {service && (
        <Row
          label="Valor total"
          value={<span className="tabular-nums">{formatCurrencyBRL(service.price)}</span>}
        />
      )}
    </dl>
  );

  if (variant === 'full') {
    return (
      <section
        aria-label="Resumo do agendamento"
        className="bg-background border-foreground/[0.08] rounded-2xl border p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
      >
        <h2 className="mb-1 text-[15px] font-semibold">Resumo</h2>
        {service ? (
          details
        ) : (
          <p className="text-label-secondary py-2 text-[14px]">Escolha um serviço para começar.</p>
        )}
      </section>
    );
  }

  if (!service) return null;
  const line = [
    service.name,
    professionalName,
    date && time ? `${WEEKDAY_SHORT[weekdayOf(date)]}, ${date.day}/${date.month} · ${time}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      aria-label="Resumo do agendamento"
      className="bg-background border-foreground/[0.08] rounded-xl border"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="text-label-secondary block text-[12px]">Seu agendamento</span>
          <span className="block truncate text-[14px] font-medium">{line}</span>
        </span>
        <span className="text-label-secondary flex shrink-0 items-center gap-0.5 text-[13px]">
          {expanded ? 'Ocultar' : 'Detalhes'}
          <ChevronDownIcon
            className={cn('size-4 transition-transform', expanded && 'rotate-180')}
          />
        </span>
      </button>
      {expanded && <div className="border-foreground/[0.06] border-t px-4 pb-2">{details}</div>}
    </section>
  );
}
