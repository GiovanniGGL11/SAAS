'use client';

import type { LucideIcon } from 'lucide-react';
import {
  BarChart3Icon,
  CalendarDaysIcon,
  MegaphoneIcon,
  PackageIcon,
  UserRoundIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

import { cn } from '@/lib/utils';
import { AppleTile } from '@/components/dashboard/apple-tile';

type Feature = {
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
  className?: string;
};

const FEATURES: Feature[] = [
  {
    icon: CalendarDaysIcon,
    color: '#007aff',
    title: 'Agenda inteligente',
    description:
      'Visualize o dia de cada profissional, arraste horários para remarcar e evite conflitos automaticamente. Seus clientes também agendam sozinhos, por um link.',
    className: 'sm:col-span-2',
  },
  {
    icon: UsersIcon,
    color: '#34c759',
    title: 'Clientes',
    description: 'Histórico completo de atendimentos e informações de cada cliente.',
  },
  {
    icon: UserRoundIcon,
    color: '#af52de',
    title: 'Profissionais',
    description:
      'Cadastre a equipe, defina o expediente e veja a comissão de cada um no relatório.',
  },
  {
    icon: WalletIcon,
    color: '#ff9500',
    title: 'Financeiro',
    description: 'Entradas, saídas e faturamento do período sempre à vista.',
  },
  {
    icon: PackageIcon,
    color: '#5856d6',
    title: 'Estoque',
    description: 'Controle de produtos e movimentações, vinculados aos atendimentos.',
  },
  {
    icon: MegaphoneIcon,
    color: '#ff2d55',
    title: 'Campanhas',
    description:
      'Cupons de desconto aplicados na hora de cobrar, e confirmação de horário pelo WhatsApp.',
  },
  {
    icon: BarChart3Icon,
    color: '#30b0c7',
    title: 'Relatórios',
    description:
      'Faturamento por profissional, serviço e dia da semana, além das taxas de cancelamento e de faltas.',
  },
];

export function FeatureGrid() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="mx-auto max-w-6xl px-5 pb-24 md:pb-32">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto mb-12 max-w-2xl text-center md:mb-16"
      >
        <p className="text-system-blue text-[15px] font-semibold">Tudo em um só lugar</p>
        <h2 className="mt-2 text-[34px] leading-[1.1] font-bold tracking-[-0.03em] text-balance md:text-[48px]">
          Feito para quem vive de agendamentos.
        </h2>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 md:gap-5">
        {FEATURES.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <AppleTile
              key={feature.title}
              index={i % 4}
              className={cn(
                'flex min-h-48 flex-col justify-between gap-8 p-6 md:p-7',
                feature.className,
              )}
            >
              <span
                className="flex size-11 items-center justify-center rounded-[12px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition-transform duration-500 group-hover/tile:scale-110 group-hover/tile:-rotate-6"
                style={{
                  background: `linear-gradient(145deg, color-mix(in oklab, ${feature.color} 70%, white), ${feature.color})`,
                }}
              >
                <Icon className="size-5" />
              </span>
              <div>
                <h3 className="text-[21px] font-semibold tracking-[-0.02em]">{feature.title}</h3>
                <p className="text-label-secondary mt-1.5 text-[15px] leading-relaxed">
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
