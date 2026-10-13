'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-media-query';

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
  const [placed, setPlaced] = React.useState<{ left: number; top: number } | null>(null);
  // On a phone a card pinned to the tap point covers what you tapped and can't fit
  // its width; anchor it to the bottom like an iOS action sheet instead.
  const isMobile = useIsMobile();

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

  // Mede depois de montar para saber a altura real e caber na tela.
  React.useLayoutEffect(() => {
    if (!position || !ref.current) {
      setPlaced(null);
      return;
    }
    const height = ref.current.offsetHeight;
    const margin = 12;
    let left = position.x + 8;
    if (left + width > window.innerWidth - margin) left = Math.max(margin, position.x - width - 8);
    let top = position.y - 24;
    if (top + height > window.innerHeight - margin)
      top = Math.max(margin, window.innerHeight - height - margin);
    setPlaced({ left, top: Math.max(margin, top) });
  }, [position, width, children]);

  if (!position) return null;

  if (isMobile) {
    return (
      <div
        ref={ref}
        role="dialog"
        className={cn(
          'bg-background ring-foreground/10 animate-in slide-in-from-bottom-4 fade-in-0 fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-50 max-h-[75svh] overflow-y-auto rounded-2xl shadow-2xl ring-1 duration-200',
          className,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="dialog"
      className={cn(
        'bg-background ring-foreground/10 fixed z-50 rounded-2xl shadow-2xl ring-1',
        !placed && 'invisible',
        className,
      )}
      style={{ width, left: placed?.left ?? position.x, top: placed?.top ?? position.y }}
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
