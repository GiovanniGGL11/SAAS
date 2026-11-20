'use client';

import * as React from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/*
  Demonstração animada dos tutoriais: uma miniatura da tela que "se usa sozinha". Cada passo
  mostra um estado da tela; o cursor vai até o elemento marcado com data-demo="<alvo>" e clica,
  e o passo seguinte mostra o resultado. Tudo fictício: nada é salvo nem enviado.

  O palco é desenhado numa largura fixa e reduzido para caber (celular incluído), assim o cursor
  acerta o alvo em qualquer tela. Quem prefere menos movimento vê os passos parados e avança à mão.
*/

export type DemoStep = {
  /** O que está acontecendo neste passo (aparece embaixo do palco). */
  caption: React.ReactNode;
  /** data-demo do elemento que o cursor clica neste passo (sem alvo, o cursor some). */
  target?: string;
  /** Tempo do passo, em ms (padrão 2800). */
  duration?: number;
};

const DESIGN_WIDTH = 520;
const CURSOR_MOVE_MS = 700;

/** Texto que vai sendo digitado (para campos da demo). */
export function Typed({
  text,
  delay = 300,
  speed = 70,
  className,
}: {
  text: string;
  delay?: number;
  speed?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [count, setCount] = React.useState(reduce ? text.length : 0);
  React.useEffect(() => {
    if (reduce) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i += 1;
      setCount(i);
      if (i < text.length) timer = setTimeout(tick, speed);
    };
    timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
  }, [text, delay, speed, reduce]);
  return (
    <span className={className}>
      {text.slice(0, count)}
      {count < text.length && (
        <span className="bg-foreground/60 ml-px inline-block h-[1em] w-px align-middle" />
      )}
    </span>
  );
}

function Cursor() {
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden>
      <path
        d="M1 1 L1 17 L5.5 13 L8.5 20.5 L11.5 19.2 L8.6 12 L15 12 Z"
        className="fill-foreground stroke-background"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DemoPlayer({
  title,
  steps,
  height,
  children,
}: {
  /** Nome curto da demonstração (ex.: "Marcar um horário"). */
  title: string;
  steps: DemoStep[];
  /** Altura do palco na largura de desenho (520 px). */
  height: number;
  /** Desenha a tela no passo indicado. */
  children: (step: number) => React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const frameRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  const [step, setStep] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const cursorRef = React.useRef<HTMLDivElement>(null);
  const rippleRef = React.useRef<HTMLSpanElement>(null);
  const last = steps.length - 1;
  const current = steps[step];

  // Escala do palco para caber na largura disponível.
  React.useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / DESIGN_WIDTH));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Começa sozinha quando aparece na tela (uma vez; depois é pelo botão).
  React.useEffect(() => {
    const el = frameRef.current;
    if (!el || reduce || started) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          setPlaying(true);
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, started]);

  // Leva o cursor até o alvo do passo (medido na tela já desenhada) e "clica" quando chega.
  // Mexe direto no elemento (animação imperativa), sem estado: a posição depende do desenho.
  React.useLayoutEffect(() => {
    const stage = stageRef.current;
    const cursorEl = cursorRef.current;
    const rippleEl = rippleRef.current;
    if (!stage || !cursorEl || !rippleEl) return;
    const el = current.target
      ? stage.querySelector<HTMLElement>(`[data-demo="${current.target}"]`)
      : null;
    if (!el) {
      const hide = animate(cursorEl, { opacity: 0 }, { duration: 0.2 });
      return () => hide.stop();
    }
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const move = animate(
      cursorEl,
      {
        left: (r.left - s.left + r.width / 2) / scale - 2,
        top: (r.top - s.top + r.height / 2) / scale - 2,
        opacity: 1,
      },
      reduce ? { duration: 0 } : { duration: CURSOR_MOVE_MS / 1000, ease: 'easeInOut' },
    );
    let click: ReturnType<typeof animate> | undefined;
    const timer = playing
      ? setTimeout(
          () => {
            click = animate(rippleEl, { scale: [0.2, 1.4], opacity: [0.9, 0] }, { duration: 0.5 });
          },
          reduce ? 0 : CURSOR_MOVE_MS + 150,
        )
      : undefined;
    return () => {
      move.stop();
      click?.stop();
      clearTimeout(timer);
    };
  }, [step, current.target, scale, playing, reduce]);

  // Avança os passos; no fim, para e oferece "Ver de novo".
  React.useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      const t = setTimeout(() => setPlaying(false), current.duration ?? 2800);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), current.duration ?? 2800);
    return () => clearTimeout(t);
  }, [playing, step, last, current.duration]);

  const go = (to: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(last, to)));
  };
  const ended = !playing && step === last && started;

  return (
    <figure className="flex flex-col gap-2" aria-label={`Demonstração: ${title}`}>
      <div
        ref={frameRef}
        className="bg-background border-foreground/10 relative w-full overflow-hidden rounded-2xl border shadow-sm"
        style={{ height: height * scale }}
      >
        <div
          ref={stageRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 origin-top-left text-[13px]"
          style={{ width: DESIGN_WIDTH, height, transform: `scale(${scale})` }}
        >
          {children(step)}
          <div
            ref={cursorRef}
            className="absolute z-50"
            style={{ left: DESIGN_WIDTH - 60, top: height - 40, opacity: 0 }}
          >
            <span
              ref={rippleRef}
              className="bg-system-blue/40 absolute -top-3 -left-3 size-7 rounded-full"
              style={{ opacity: 0 }}
            />
            <Cursor />
          </div>
        </div>
      </div>

      <figcaption className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            aria-label="Passo anterior"
            className="hover:bg-foreground/[0.06] rounded-full p-1.5 disabled:opacity-30"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (ended) {
                setStep(0);
                setPlaying(true);
              } else {
                setStarted(true);
                setPlaying((p) => !p);
              }
            }}
            aria-label={ended ? 'Ver de novo' : playing ? 'Pausar' : 'Tocar'}
            className="bg-system-blue text-background rounded-full p-1.5"
          >
            {ended ? (
              <RotateCcwIcon className="size-4" />
            ) : playing ? (
              <PauseIcon className="size-4" />
            ) : (
              <PlayIcon className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => go(step + 1)}
            disabled={step === last}
            aria-label="Próximo passo"
            className="hover:bg-foreground/[0.06] rounded-full p-1.5 disabled:opacity-30"
          >
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
        <span className="text-label-secondary text-[12px] tabular-nums">
          Demonstração · {step + 1}/{steps.length}
        </span>
        <p className="min-w-0 basis-full text-[14px] sm:flex-1 sm:basis-0" aria-live="polite">
          {current.caption}
        </p>
      </figcaption>
      <div className="flex gap-1" aria-hidden>
        {steps.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= step ? 'bg-system-blue' : 'bg-foreground/10',
            )}
          />
        ))}
      </div>
    </figure>
  );
}

/** Peças comuns das telas de demonstração. */
export function MiniButton({
  demo,
  children,
  tone = 'primary',
  className,
}: {
  demo?: string;
  children: React.ReactNode;
  tone?: 'primary' | 'outline' | 'ghost' | 'green';
  className?: string;
}) {
  return (
    <span
      data-demo={demo}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full px-3 text-[12px] font-medium whitespace-nowrap',
        tone === 'primary' && 'bg-system-blue text-white',
        tone === 'green' && 'bg-system-green text-white',
        tone === 'outline' && 'border-foreground/15 bg-background border',
        tone === 'ghost' && 'text-system-blue',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function MiniField({
  label,
  demo,
  children,
  focused,
}: {
  label: string;
  demo?: string;
  children?: React.ReactNode;
  focused?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-label-secondary text-[11px]">{label}</span>
      <div
        data-demo={demo}
        className={cn(
          'bg-background flex h-8 items-center rounded-lg border px-2.5 text-[12px]',
          focused ? 'border-system-blue ring-system-blue/20 ring-2' : 'border-foreground/15',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Aviso que aparece no canto (como o do sistema). */
export function MiniToast({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-foreground text-background absolute right-3 bottom-3 z-40 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] shadow-lg"
    >
      {children}
    </motion.div>
  );
}

/** Aparece com um leve "surgir" (janelas e itens novos). */
export function Pop({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
