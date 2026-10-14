'use client';

import type { LucideIcon } from 'lucide-react';
import {
  BarChart3Icon,
  CalendarDaysIcon,
  GiftIcon,
  PackageIcon,
  UserRoundIcon,
  UsersIcon,
  VaultIcon,
  WalletIcon,
} from 'lucide-react';

import { AppleTile } from '@/components/dashboard/apple-tile';
import { SectionTitle } from '@/components/landing/reveal';

type Feature = { icon: LucideIcon; color: string; title: string; description: string };

const FEATURES: Feature[] = [
  {
    icon: CalendarDaysIcon,
    color: '#ff3b30',
    title: 'Agenda',
    description:
      'Dia, semana e mês por profissional. Arraste para remarcar, sem conflito de horário.',
  },
  {
    icon: UsersIcon,
    color: '#34c759',
    title: 'Clientes',
    description: 'Histórico, aniversários, VIPs e quem não volta há tempos.',
  },
  {
    icon: UserRoundIcon,
    color: '#af52de',
    title: 'Profissionais',
    description: 'Expediente, folgas e comissão de cada um.',
  },
  {
    icon: VaultIcon,
    color: '#34aadc',
    title: 'Caixa',
    description: 'Abertura, sangria, suprimento e fechamento conferido.',
  },
  {
    icon: WalletIcon,
    color: '#30b0c7',
    title: 'Financeiro',
    description: 'Contas a pagar e receber, taxas de cartão e lucro do mês.',
  },
  {
    icon: PackageIcon,
    color: '#5856d6',
    title: 'Estoque',
    description: 'Produtos vendidos e usados nos atendimentos, com aviso de estoque baixo.',
  },
  {
    icon: GiftIcon,
    color: '#ff9500',
    title: 'Fidelidade e cupons',
    description: 'Cartão fidelidade, pontos ou cashback, e cupons de desconto.',
  },
  {
    icon: BarChart3Icon,
    color: '#007aff',
    title: 'Painel e relatórios',
    description: 'Ocupação, retorno de clientes, meta do mês, comissões e faturamento por serviço.',
  },
];

export function FeatureGrid() {
  return (
    <section id="recursos" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24 md:pb-32">
      <SectionTitle eyebrow="Tudo em um só lugar" title="Feito para quem vive de agendamentos." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {FEATURES.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <AppleTile
              key={feature.title}
              index={i % 4}
              className="flex flex-col gap-5 p-4 md:gap-8 md:p-7"
            >
              <span
                className="flex size-10 items-center justify-center rounded-[11px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition-transform duration-500 group-hover/tile:scale-110 group-hover/tile:-rotate-6 md:size-11"
                style={{
                  background: `linear-gradient(145deg, color-mix(in oklab, ${feature.color} 70%, white), ${feature.color})`,
                }}
              >
                <Icon className="size-5" />
              </span>
              <div>
                <h3 className="text-[17px] font-semibold tracking-[-0.02em] md:text-[21px]">
                  {feature.title}
                </h3>
                <p className="text-label-secondary mt-1 text-[13px] leading-snug md:mt-1.5 md:text-[15px] md:leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </AppleTile>
          );
        })}
      </div>
    </section>
  );
}
