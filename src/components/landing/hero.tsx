'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRightIcon, CheckIcon, GlobeIcon, MessageCircleIcon, VaultIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

import { cn } from '@/lib/utils';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Hero: uma cor de marca (azul) sobre fundo limpo. Texto à esquerda; à direita o produto de
 * verdade — a agenda do dia com o que acontece em volta dela (agendamento online chegando,
 * confirmação no WhatsApp, caixa do dia).
 */
export function Hero() {
  const reduceMotion = useReducedMotion();
  const enter = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, delay, ease: EASE },
        };

  return (
    <section className="relative isolate overflow-hidden">
      {/* Fundo: pontilhado sutil que some nas bordas + brilho azul atrás do produto */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="hero-dots absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_60%_40%,black,transparent)]" />
        <div className="bg-system-blue/20 dark:bg-system-blue/25 absolute top-[10%] right-[-10%] size-[44rem] rounded-full blur-[120px] md:right-[0%]" />
        <div className="from-background absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t to-transparent" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-14 pb-20 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-24 lg:pb-28">
        <div className="text-center lg:text-left">
          <motion.div {...enter(0)}>
            <a
              href="#diferenciais"
              className="bg-background ring-foreground/10 hover:ring-foreground/20 inline-flex items-center gap-2 rounded-full py-1 pr-3.5 pl-1 text-[13px] font-medium shadow-sm ring-1 transition-shadow"
            >
              <span className="bg-system-blue rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">
                Novo
              </span>
              Painel de gestão com meta do mês
              <ArrowRightIcon className="text-label-secondary size-3.5" />
            </a>
          </motion.div>

          <motion.h1
            {...enter(0.08)}
            className="mt-6 text-[44px] leading-[1.02] font-bold tracking-[-0.045em] text-balance sm:text-[60px] lg:text-[58px] xl:text-[68px]"
          >
            Agenda cheia.
            <br />
            <span className="text-system-blue">Caixa no controle.</span>
          </motion.h1>

          <motion.p
            {...enter(0.16)}
            className="text-foreground/70 mx-auto mt-6 max-w-[34rem] text-[18px] leading-relaxed text-pretty md:text-[20px] lg:mx-0"
          >
            O sistema para salões, barbearias e clínicas de estética: seus clientes marcam sozinhos,
            confirmam pelo WhatsApp, e você cobra, fecha o caixa e vê o lucro do mês.
          </motion.p>

          <motion.div
            {...enter(0.24)}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
          >
            <Link
              href="/sign-up"
              className="bg-system-blue group inline-flex h-12 items-center gap-2 rounded-full px-7 text-[17px] font-semibold text-white shadow-[0_12px_32px_-12px_var(--system-blue)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Começar agora
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#diferenciais"
              className="bg-background ring-foreground/12 hover:bg-foreground/[0.03] inline-flex h-12 items-center rounded-full px-6 text-[17px] font-medium ring-1 transition-colors"
            >
              Ver como funciona
            </a>
          </motion.div>

          <motion.ul
            {...enter(0.32)}
            className="text-foreground/60 mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[14px] lg:justify-start"
          >
            {[
              'Sem instalar nada',
              'Funciona no celular',
              'Cada empresa vê só os próprios dados',
            ].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <CheckIcon className="text-system-blue size-4" />
                {item}
              </li>
            ))}
          </motion.ul>
        </div>

        <HeroProduct reduceMotion={!!reduceMotion} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

const ROW = 52;
const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00'];

type Block = {
  client: string;
  service: string;
  start: number;
  length: number;
  color: string;
  online?: boolean;
};

const COLUMNS: { name: string; initials: string; color: string; blocks: Block[] }[] = [
  {
    name: 'Ana',
    initials: 'AS',
    color: '#0a84ff',
    blocks: [
      { client: 'Paula Lima', service: 'Corte feminino', start: 0, length: 1, color: '#0a84ff' },
      { client: 'Marina Costa', service: 'Escova', start: 1.5, length: 0.75, color: '#0a84ff' },
      {
        client: 'Júlia Rocha',
        service: 'Coloração',
        start: 2.5,
        length: 1.5,
        color: '#0a84ff',
        online: true,
      },
    ],
  },
  {
    name: 'Bruno',
    initials: 'BA',
    color: '#30d158',
    blocks: [
      { client: 'Rafael Dias', service: 'Corte + barba', start: 0.5, length: 1, color: '#30d158' },
      { client: 'Lucas Melo', service: 'Barba', start: 2, length: 0.5, color: '#30d158' },
      { client: 'André Nunes', service: 'Corte', start: 3, length: 0.75, color: '#30d158' },
    ],
  },
  {
    name: 'Carla',
    initials: 'CM',
    color: '#bf5af2',
    blocks: [
      { client: 'Beatriz Ramos', service: 'Manicure', start: 0, length: 0.75, color: '#bf5af2' },
      { client: 'Fernanda Luz', service: 'Pé e mão', start: 1.25, length: 1.25, color: '#bf5af2' },
      { client: 'Sofia Prado', service: 'Unha em gel', start: 3, length: 1, color: '#bf5af2' },
    ],
  },
];

function HeroProduct({ reduceMotion }: { reduceMotion: boolean }) {
  const pop = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 14, scale: 0.94 },
          animate: { opacity: 1, y: 0, scale: 1 },
          transition: { delay, type: 'spring' as const, stiffness: 220, damping: 20 },
        };

  return (
    <div
      className="relative mx-auto w-full max-w-[560px] pt-14 pb-12 lg:pt-0 lg:pb-0"
      role="img"
      aria-label="Exemplo da agenda do Atendafy com um agendamento online, uma confirmação pelo WhatsApp e o caixa do dia"
    >
      <motion.div
        {...(reduceMotion
          ? {}
          : {
              initial: { opacity: 0, y: 24 },
              animate: { opacity: 1, y: 0 },
              transition: { duration: 0.9, delay: 0.2, ease: EASE },
            })}
        className="bg-background ring-foreground/10 overflow-hidden rounded-[24px] shadow-[0_30px_80px_-30px_rgb(0_40_120/0.35)] ring-1 dark:shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]"
      >
        <div className="border-foreground/[0.06] flex items-center gap-4 border-b px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[13px] font-semibold">Hoje · terça, 14 de outubro</span>
        </div>
        <div className="flex p-3">
          <div className="w-10 shrink-0 pt-9">
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ height: ROW }}
                className="text-label-secondary -translate-y-1.5 text-[10px] tabular-nums"
              >
                {h}
              </div>
            ))}
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5">
            {COLUMNS.map((column, ci) => (
              <div key={column.name} className="min-w-0">
                <div className="flex h-9 items-center gap-1.5 px-1">
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                    style={{ background: column.color }}
                  >
                    {column.initials}
                  </span>
                  <span className="truncate text-[12px] font-semibold">{column.name}</span>
                </div>
                <div
                  className="bg-foreground/[0.025] relative rounded-lg"
                  style={{
                    height: ROW * HOURS.length,
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW - 1}px, color-mix(in oklab, var(--foreground) 7%, transparent) ${ROW - 1}px, color-mix(in oklab, var(--foreground) 7%, transparent) ${ROW}px)`,
                  }}
                >
                  {column.blocks.map((b) => (
                    <div
                      key={b.client}
                      className={cn(
                        'absolute inset-x-0.5 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1',
                        b.online && 'ring-system-blue/50 ring-2',
                      )}
                      style={{
                        top: b.start * ROW + 2,
                        height: b.length * ROW - 4,
                        background: `color-mix(in oklab, ${b.color} 15%, var(--background))`,
                        borderColor: b.color,
                      }}
                    >
                      <div className="flex items-center gap-1 truncate text-[10.5px] font-semibold">
                        {b.online && (
                          <GlobeIcon className="size-2.5 shrink-0" style={{ color: b.color }} />
                        )}
                        <span className="truncate">{b.client}</span>
                      </div>
                      {b.length >= 0.75 && (
                        <div className="text-label-secondary truncate text-[9.5px]">
                          {b.service}
                        </div>
                      )}
                    </div>
                  ))}
                  {ci === 0 && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                      style={{ top: ROW * 1.35 }}
                    >
                      <span className="size-1.5 -translate-x-0.5 rounded-full bg-[#ff3b30]" />
                      <span className="h-px flex-1 bg-[#ff3b30]" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Agendamento online chegando */}
      <motion.div
        {...pop(0.9)}
        className="bg-background/95 ring-foreground/10 absolute top-0 -right-2 flex w-[230px] items-center gap-3 rounded-2xl p-3 shadow-[0_18px_40px_-16px_rgb(0_40_120/0.35)] ring-1 backdrop-blur sm:-right-6 lg:top-[-34px] lg:-right-8"
      >
        <span className="bg-system-blue flex size-9 shrink-0 items-center justify-center rounded-full text-white">
          <GlobeIcon className="size-4" />
        </span>
        <div className="min-w-0 text-left">
          <p className="text-[12px] font-semibold">Novo agendamento online</p>
          <p className="text-label-secondary truncate text-[11px]">
            Júlia Rocha · Coloração · 11:30
          </p>
        </div>
      </motion.div>

      {/* Confirmação pelo WhatsApp */}
      <motion.div
        {...pop(1.25)}
        className="bg-background/95 ring-foreground/10 absolute -right-2 bottom-0 hidden w-[210px] items-center gap-3 rounded-2xl p-3 shadow-[0_18px_40px_-16px_rgb(0_40_120/0.35)] ring-1 backdrop-blur sm:-right-6 sm:flex lg:-right-8 lg:-bottom-8"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white">
          <MessageCircleIcon className="size-4" />
        </span>
        <div className="min-w-0 text-left">
          <p className="text-[12px] font-semibold">Paula confirmou</p>
          <p className="text-label-secondary truncate text-[11px]">pelo link no WhatsApp</p>
        </div>
      </motion.div>

      {/* Caixa do dia */}
      <motion.div
        {...pop(1.6)}
        className="bg-background/95 ring-foreground/10 absolute bottom-0 -left-2 flex items-center gap-3 rounded-2xl p-3 pr-4 shadow-[0_18px_40px_-16px_rgb(0_40_120/0.35)] ring-1 backdrop-blur sm:-left-6 lg:-bottom-8 lg:-left-10"
      >
        <span className="bg-foreground text-background flex size-9 shrink-0 items-center justify-center rounded-full">
          <VaultIcon className="size-4" />
        </span>
        <div className="text-left">
          <p className="text-label-secondary text-[11px]">Caixa de hoje</p>
          <p className="text-[17px] leading-tight font-bold tracking-tight tabular-nums">
            R$ 1.248,00
          </p>
        </div>
        <span className="bg-system-green/15 text-system-green ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
          +18%
        </span>
      </motion.div>
    </div>
  );
}
