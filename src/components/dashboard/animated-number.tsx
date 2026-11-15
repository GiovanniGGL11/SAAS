'use client';

import * as React from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';

import { formatCurrencyBRL } from '@/lib/serialize';

export type NumberFormat = 'currency' | 'integer' | 'percent';

function format(value: number, kind: NumberFormat): string {
  if (kind === 'currency') return formatCurrencyBRL(value);
  if (kind === 'percent') return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  return Math.round(value).toLocaleString('pt-BR');
}

/** Counts up from zero to `value` the first time it scrolls into view. */
export function AnimatedNumber({
  value,
  format: kind,
  className,
}: {
  value: number;
  format: NumberFormat;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduceMotion = useReducedMotion();
  /** Último valor mostrado: ao trocar o período, conta a partir dele (não do zero). */
  const shown = React.useRef<number | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No celular o número já aparece pronto: contar enquanto a pessoa rola deixa a rolagem pesada.
    const instant = reduceMotion || window.matchMedia('(max-width: 767px)').matches;
    if (instant) {
      el.textContent = format(value, kind);
      shown.current = value;
      return;
    }
    if (!inView) return;
    const from = shown.current ?? 0;
    shown.current = value;
    const controls = animate(from, value, {
      duration: from === 0 ? 1.4 : 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        el.textContent = format(latest, kind);
      },
    });
    return () => controls.stop();
  }, [inView, value, kind, reduceMotion]);

  return (
    <span ref={ref} className={className} aria-label={format(value, kind)}>
      {format(0, kind)}
    </span>
  );
}
