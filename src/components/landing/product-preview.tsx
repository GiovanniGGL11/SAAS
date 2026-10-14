'use client';

import * as React from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { GlobeIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/*
  Prévia da agenda (o coração do produto) com dados de exemplo: uma coluna por profissional, a
  linha do "agora" e um agendamento online chegando depois de entrar na tela.
*/

const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00'];
const ROW = 64; // px por hora

type Block = {
  client: string;
  service: string;
  start: number; // horas desde 9h
  length: number; // horas
  color: string;
  status?: string;
  online?: boolean;
};

const COLUMNS: { name: string; initials: string; color: string; blocks: Block[] }[] = [
  {
    name: 'Ana Souza',
    initials: 'AS',
    color: '#0a84ff',
    blocks: [
      {
        client: 'Paula Lima',
        service: 'Corte feminino',
        start: 0,
        length: 1,
        color: '#0a84ff',
        status: 'Confirmado',
      },
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
    name: 'Bruno Alves',
    initials: 'BA',
    color: '#30d158',
    blocks: [
      {
        client: 'Rafael Dias',
        service: 'Corte + barba',
        start: 0.5,
        length: 1,
        color: '#30d158',
        status: 'Em atendimento',
      },
      { client: 'Lucas Melo', service: 'Barba', start: 2, length: 0.5, color: '#30d158' },
      { client: 'André Nunes', service: 'Corte', start: 3, length: 0.75, color: '#30d158' },
    ],
  },
  {
    name: 'Carla Mendes',
    initials: 'CM',
    color: '#bf5af2',
    blocks: [
      { client: 'Beatriz Ramos', service: 'Manicure', start: 0, length: 0.75, color: '#bf5af2' },
      {
        client: 'Fernanda Luz',
        service: 'Pé e mão',
        start: 1.25,
        length: 1.25,
        color: '#bf5af2',
        status: 'Confirmado',
      },
      { client: 'Sofia Prado', service: 'Unha em gel', start: 3, length: 1, color: '#bf5af2' },
    ],
  },
];

export function ProductPreview() {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [22, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.4], [0.3, 1]);

  return (
    <section className="px-5 pb-20 md:pb-28" style={{ perspective: 1400 }}>
      <motion.div
        ref={ref}
        style={
          reduceMotion ? undefined : { rotateX, scale, opacity, transformOrigin: 'center top' }
        }
        className="bg-background ring-foreground/10 mx-auto max-w-5xl overflow-hidden rounded-[28px] shadow-[0_40px_120px_-40px_rgb(0_0_0/0.45)] ring-1"
        aria-label="Exemplo da agenda do Atendafy"
        role="img"
      >
        <div className="border-foreground/[0.06] flex items-center gap-2 border-b px-5 py-3.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
          <span className="text-label-secondary ml-3 truncate text-xs">
            Agenda · dados de exemplo
          </span>
        </div>

        <div className="font-apple flex items-center justify-between gap-3 px-4 pt-4 md:px-6 md:pt-5">
          <div className="text-[15px] font-semibold tracking-tight md:text-[20px]">
            Terça, 14 de outubro
          </div>
          <div className="bg-foreground/[0.06] hidden rounded-full p-0.5 text-[12px] sm:flex">
            <span className="bg-background rounded-full px-3 py-1 font-medium shadow-sm">Dia</span>
            <span className="text-label-secondary px-3 py-1">Semana</span>
            <span className="text-label-secondary px-3 py-1">Mês</span>
          </div>
        </div>

        <div className="font-apple flex p-3 md:p-5">
          {/* Horas */}
          <div className="w-11 shrink-0 pt-12 md:w-14">
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ height: ROW }}
                className="text-label-secondary -translate-y-2 text-[10px] tabular-nums md:text-[11px]"
              >
                {h}
              </div>
            ))}
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 md:grid-cols-3 md:gap-2">
            {COLUMNS.map((column, ci) => (
              <div key={column.name} className={cn('min-w-0', ci === 2 && 'hidden md:block')}>
                <div className="flex h-12 items-center gap-2 px-1">
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                    style={{ background: column.color }}
                  >
                    {column.initials}
                  </span>
                  <span className="truncate text-[12px] font-semibold md:text-[13px]">
                    {column.name}
                  </span>
                </div>
                <div
                  className="bg-foreground/[0.025] relative rounded-xl"
                  style={{
                    height: ROW * HOURS.length,
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW - 1}px, color-mix(in oklab, var(--foreground) 7%, transparent) ${ROW - 1}px, color-mix(in oklab, var(--foreground) 7%, transparent) ${ROW}px)`,
                  }}
                >
                  {column.blocks.map((block) => (
                    <AppointmentBlock
                      key={block.client}
                      block={block}
                      reduceMotion={!!reduceMotion}
                    />
                  ))}
                  {ci === 0 && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                      style={{ top: ROW * 1.35 }}
                    >
                      <span className="size-2 -translate-x-1 rounded-full bg-[#ff3b30]" />
                      <span className="h-px flex-1 bg-[#ff3b30]" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function AppointmentBlock({ block, reduceMotion }: { block: Block; reduceMotion: boolean }) {
  const style = {
    top: block.start * ROW + 2,
    height: block.length * ROW - 4,
    background: `color-mix(in oklab, ${block.color} 16%, var(--background))`,
    borderColor: block.color,
  };
  const content = (
    <>
      <div className="flex items-center gap-1 truncate text-[11px] font-semibold md:text-[12px]">
        {block.online && <GlobeIcon className="size-3 shrink-0" style={{ color: block.color }} />}
        <span className="truncate">{block.client}</span>
      </div>
      {block.length >= 0.75 && (
        <div className="text-label-secondary truncate text-[10px] md:text-[11px]">
          {block.service}
        </div>
      )}
      {block.status && block.length >= 1 && (
        <div className="mt-0.5 truncate text-[10px] font-medium" style={{ color: block.color }}>
          {block.status}
        </div>
      )}
    </>
  );
  const className = 'absolute inset-x-1 overflow-hidden rounded-lg border-l-[3px] px-2 py-1';

  if (!block.online) {
    return (
      <div className={className} style={style}>
        {content}
      </div>
    );
  }
  // O agendamento online "chega" depois que a agenda aparece, com um selo.
  return (
    <motion.div
      className={cn(className, 'ring-system-blue/40 ring-2')}
      style={style}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-120px' }}
      transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 20 }}
    >
      {content}
      <div className="bg-system-blue mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white md:text-[10px]">
        Agendou online
      </div>
    </motion.div>
  );
}
