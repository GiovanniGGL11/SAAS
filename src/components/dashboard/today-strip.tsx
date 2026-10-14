import Link from 'next/link';
import { CalendarCheckIcon, CalendarRangeIcon, VaultIcon, WalletIcon } from 'lucide-react';

import { formatCurrencyBRL } from '@/lib/serialize';
import { cn } from '@/lib/utils';
import type { getTodayOverview } from '@/server/data/insights';

type Overview = Awaited<ReturnType<typeof getTodayOverview>>;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** O dia de hoje em quatro números, cada um levando à tela onde se age. */
export function TodayStrip({ overview, showMoney }: { overview: Overview; showMoney: boolean }) {
  const items = [
    {
      href: '/agenda',
      icon: CalendarCheckIcon,
      color: 'var(--system-blue)',
      label: 'Atendimentos hoje',
      value: String(overview.appointments),
      hint:
        overview.appointments === 0
          ? 'Nada marcado para hoje'
          : [
              overview.done && plural(overview.done, 'concluído', 'concluídos'),
              overview.confirmed && plural(overview.confirmed, 'confirmado', 'confirmados'),
              overview.toConfirm && `${overview.toConfirm} a confirmar`,
            ]
              .filter(Boolean)
              .join(' · ') || 'Em atendimento',
    },
    showMoney && {
      href: '/agenda',
      icon: WalletIcon,
      color: 'var(--system-green)',
      label: 'Previsto para hoje',
      value: formatCurrencyBRL(overview.expectedRevenue),
      hint: 'Soma dos serviços marcados',
    },
    {
      href: '/agenda',
      icon: CalendarRangeIcon,
      color: '#af52de',
      label: 'Agenda dos próximos 7 dias',
      value:
        overview.weekOccupancy === null
          ? '—'
          : `${overview.weekOccupancy.toLocaleString('pt-BR')}%`,
      hint: 'do horário da equipe já está ocupado',
    },
    {
      href: '/caixa',
      icon: VaultIcon,
      color: '#34aadc',
      label: 'Caixa',
      value: overview.cashOpen ? 'Aberto' : 'Fechado',
      hint: overview.cashOpen ? 'Toque para conferir a gaveta' : 'Abra para começar o dia',
    },
  ].filter(Boolean) as {
    href: string;
    icon: typeof WalletIcon;
    color: string;
    label: string;
    value: string;
    hint: string;
  }[];

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 md:gap-4',
        items.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
      )}
    >
      {items.map(({ href, icon: Icon, color, label, value, hint }) => (
        <Link
          key={label}
          href={href}
          className="bg-tile hover:bg-tile-hover flex flex-col gap-3 rounded-[22px] p-4 transition-colors md:p-5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-label-secondary text-[13px] font-medium">{label}</span>
            <Icon className="size-4 shrink-0" style={{ color }} />
          </div>
          <div>
            <div className="text-[22px] leading-none font-semibold tracking-[-0.025em] tabular-nums md:text-[26px]">
              {value}
            </div>
            <div className="text-label-secondary mt-2 text-[12px] leading-snug">{hint}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
