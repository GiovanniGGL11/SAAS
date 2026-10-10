'use client';

import * as React from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';

import { formatCurrencyBRL } from '@/lib/serialize';

export type NumberFormat = 'currency' | 'integer';

function format(value: number, kind: NumberFormat): string {
  return kind === 'currency' ? formatCurrencyBRL(value) : Math.round(value).toLocaleString('pt-BR');
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

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduceMotion) {
      el.textContent = format(value, kind);
      return;
    }
    const controls = animate(0, value, {
      duration: 1.4,
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
