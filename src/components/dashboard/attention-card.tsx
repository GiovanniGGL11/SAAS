import Link from 'next/link';
import {
  CakeIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  PackageIcon,
  ReceiptIcon,
  UserRoundXIcon,
  VaultIcon,
} from 'lucide-react';

import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { formatCurrencyBRL } from '@/lib/serialize';
import type { getTodayOverview } from '@/server/data/insights';

type Overview = Awaited<ReturnType<typeof getTodayOverview>>;

const pad = (n: number) => String(n).padStart(2, '0');

/** Pendências do dia, cada uma com o atalho para resolver. Some quando está tudo em dia. */
export function AttentionCard({ overview, isAdmin }: { overview: Overview; isAdmin: boolean }) {
  const t = overview.tomorrowDate;
  const items = [
    overview.tomorrowUnconfirmed > 0 && {
      icon: CalendarClockIcon,
      color: '#ff9500',
      text:
        overview.tomorrowUnconfirmed === 1
          ? '1 horário de amanhã sem confirmação'
          : `${overview.tomorrowUnconfirmed} horários de amanhã sem confirmação`,
      action: 'Confirmar',
      href: `/agenda?data=${t.year}-${pad(t.month)}-${pad(t.day)}`,
    },
    !overview.cashOpen &&
      overview.appointments > 0 && {
        icon: VaultIcon,
        color: '#34aadc',
        text: 'O caixa de hoje ainda não foi aberto',
        action: 'Abrir caixa',
        href: '/caixa',
      },
    isAdmin &&
      overview.billsDue.count > 0 && {
        icon: ReceiptIcon,
        color: '#ff3b30',
        text: `${overview.billsDue.count} ${overview.billsDue.count === 1 ? 'conta a pagar vence' : 'contas a pagar vencem'} em até 7 dias · ${formatCurrencyBRL(overview.billsDue.amount)}`,
        action: 'Ver contas',
        href: '/financeiro',
      },
    overview.birthdays.length > 0 && {
      icon: CakeIcon,
      color: '#ff2d55',
      text:
        overview.birthdays.length === 1
          ? `${overview.birthdays[0].name} faz aniversário hoje`
          : `${overview.birthdays.length} clientes fazem aniversário hoje`,
      action: 'Ver',
      href: '/clientes?filtro=aniversariantes',
    },
    overview.lapsed.count > 0 && {
      icon: UserRoundXIcon,
      color: '#5856d6',
      text: `${overview.lapsed.count} ${overview.lapsed.count === 1 ? 'cliente não volta' : 'clientes não voltam'} há mais de 60 dias`,
      action: 'Chamar de volta',
      href: '/clientes?filtro=sumidos',
    },
    isAdmin &&
      overview.lowStock > 0 && {
        icon: PackageIcon,
        color: '#5856d6',
        text: `${overview.lowStock} ${overview.lowStock === 1 ? 'produto' : 'produtos'} com estoque baixo`,
        action: 'Repor',
        href: '/estoque',
      },
  ].filter(Boolean) as {
    icon: typeof CakeIcon;
    color: string;
    text: string;
    action: string;
    href: string;
  }[];

  return (
    <AppleTile interactive={false} className="flex flex-col gap-3 p-5 md:p-6">
      <TileEyebrow>Precisa de atenção</TileEyebrow>
      {items.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-[15px] font-medium">
          <CheckCircle2Icon className="text-system-green size-5" />
          Tudo em dia por aqui.
        </div>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((item) => (
            <li key={item.text}>
              <Link
                href={item.href}
                className="hover:bg-foreground/[0.04] flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: `color-mix(in oklab, ${item.color} 15%, transparent)`,
                    color: item.color,
                  }}
                >
                  <item.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-[14px] leading-snug">{item.text}</span>
                <span className="text-system-blue hidden shrink-0 text-[13px] font-medium sm:inline">
                  {item.action}
                </span>
                <ChevronRightIcon className="text-label-secondary size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppleTile>
  );
}
