'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

export type FloatingMenuItem = {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
};

/**
 * Cartão aberto junto ao ponto do clique — como os cartões do Google Agenda: o detalhe do
 * agendamento, a criação rápida num horário vazio e o menu do botão direito. Fecha ao clicar fora
 * ou apertar Esc; reposiciona para não sair da tela.
 */
export function FloatingPanel({
  position,
  onClose,
  width = 320,
  className,
  children,
}: {
  position: { x: number; y: number } | null;
  onClose: () => void;
  width?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  // No celular o cartão vira painel de baixo, como nos apps de calendário: o ponto do toque não
  // deixa espaço para um cartão de 360px na tela estreita. Só renderiza depois de um clique, então
  // `window` existe.
  const isSheet = position !== null && typeof window !== 'undefined' && window.innerWidth < 640;

  React.useEffect(() => {
    if (!position) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement;
      if (ref.current?.contains(target)) return;
      // Listas suspensas (combobox, select) abrem num portal fora do cartão e não devem fechá-lo.
      if (target.closest('[data-radix-popper-content-wrapper], [cmdk-root], [role="listbox"]'))
        return;
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [position, onClose]);

  // Mede e reposiciona direto no elemento para caber na tela — de novo sempre que o conteúdo muda
  // de tamanho (abrir a confirmação de cancelar, trocar de aba), senão a parte de baixo some.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!position || !el || isSheet) return;
    const place = () => {
      const margin = 12;
      let left = position.x + 8;
      if (left + width > window.innerWidth - margin)
        left = Math.max(margin, position.x - width - 8);
      let top = position.y - 24;
      if (top + el.offsetHeight > window.innerHeight - margin)
        top = Math.max(margin, window.innerHeight - el.offsetHeight - margin);
      el.style.left = `${left}px`;
      el.style.top = `${Math.max(margin, top)}px`;
      el.style.visibility = 'visible';
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [position, width, isSheet]);

  if (!position) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      className={cn(
        'bg-background ring-foreground/10 fixed z-50 rounded-2xl shadow-2xl ring-1',
        isSheet &&
          'right-0 bottom-0 left-0 max-h-[85svh] overflow-y-auto rounded-b-none pb-[env(safe-area-inset-bottom)]',
        className,
      )}
      style={
        isSheet ? undefined : { width, left: position.x, top: position.y, visibility: 'hidden' }
      }
    >
      {children}
    </div>
  );
}

/** Menu curto (botão direito no card, clique num bloqueio), sobre o mesmo cartão flutuante. */
export function FloatingMenu({
  position,
  title,
  items,
  onClose,
}: {
  position: { x: number; y: number } | null;
  title?: string;
  items: FloatingMenuItem[];
  onClose: () => void;
}) {
  return (
    <FloatingPanel
      position={position}
      onClose={onClose}
      width={220}
      className="overflow-hidden rounded-xl p-1"
    >
      <div role="menu">
        {title && (
          <div className="text-label-secondary px-3 pt-1.5 pb-1 text-[11px] font-medium">
            {title}
          </div>
        )}
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={cn(
              'hover:bg-foreground/[0.06] flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px]',
              item.destructive && 'text-destructive',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </FloatingPanel>
  );
}
