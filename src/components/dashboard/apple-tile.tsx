'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Apple-style surface: borderless #f5f5f7 tile with a large radius, a soft
 * spotlight that follows the cursor and a fade-up entrance when it scrolls into view.
 * The spotlight position is written to CSS variables directly so mouse moves
 * never re-render React.
 *
 * A entrada é só CSS (opacidade/posição, feitas pela placa de vídeo) e só no computador: no
 * celular os blocos já aparecem prontos, para a rolagem ficar lisa.
 */
export function AppleTile({
  children,
  className,
  interactive = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Posição no grupo de blocos (mantido por compatibilidade; a entrada não é mais escalonada). */
  index?: number;
  /** Enables the hover lift + cursor spotlight. */
  interactive?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  // Marca o bloco como visível direto no elemento (sem re-renderizar o React).
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = () => {
      el.dataset.shown = 'true';
    };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      show();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          show();
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={interactive ? handlePointerMove : undefined}
      className={cn(
        'group/tile bg-tile relative isolate overflow-hidden rounded-[22px] p-5 md:p-6',
        // Entrada (só no computador): começa um pouco abaixo e transparente.
        'md:transition-[opacity,translate,scale,background-color,box-shadow] md:duration-500 md:ease-[cubic-bezier(0.25,0.1,0.25,1)]',
        'md:translate-y-6 md:scale-[0.98] md:opacity-0 md:data-[shown=true]:translate-y-0 md:data-[shown=true]:scale-100 md:data-[shown=true]:opacity-100',
        interactive &&
          'hover:bg-tile-hover hover:shadow-[0_18px_40px_-24px_rgb(0_0_0/0.25)] md:data-[shown=true]:hover:-translate-y-0.5',
        className,
      )}
    >
      {interactive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover/tile:opacity-100"
          style={{
            background:
              'radial-gradient(420px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in oklab, var(--system-blue) 9%, transparent), transparent 70%)',
          }}
        />
      )}
      {children}
    </div>
  );
}

export function TileEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-label-secondary text-[13px] font-medium">{children}</div>;
}
