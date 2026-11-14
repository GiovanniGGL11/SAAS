'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { SegmentedControl } from '@/components/ui/segmented-control';

export type MobileSection = { id: string; label: string; content: React.ReactNode };

/**
 * Telas longas no celular: uma aba por assunto, tudo a um toque (nada fica escondido). No
 * computador, as seções aparecem uma embaixo da outra, como sempre.
 */
export function MobileSections({
  sections,
  className,
}: {
  sections: MobileSection[];
  className?: string;
}) {
  const [active, setActive] = React.useState(sections[0]?.id ?? '');

  function choose(id: string) {
    setActive(id);
    // Trocar de aba volta ao topo da seção, como num app.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className={cn('flex w-full flex-col gap-4 md:gap-5', className)}>
      <div className="bg-background/85 sticky top-14 z-20 -mx-4 px-4 py-2 backdrop-blur-xl md:hidden">
        <SegmentedControl
          stretch
          value={active}
          onValueChange={choose}
          options={sections.map((s) => ({ value: s.id, label: s.label }))}
        />
      </div>
      {sections.map((s) => (
        <section
          key={s.id}
          aria-label={s.label}
          className={cn('flex flex-col gap-4 md:gap-5', s.id !== active && 'max-md:hidden')}
        >
          {s.content}
        </section>
      ))}
    </div>
  );
}
