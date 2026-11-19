import * as React from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, BookOpenIcon, InfoIcon, LightbulbIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader, Surface } from '@/components/layout/page';
import { cn } from '@/lib/utils';

/*
  Peças comuns dos tutoriais "Como usar" de cada aba: o mesmo formato em todo o sistema
  (título, índice lateral, seções, quadro de campos, dicas e dúvidas comuns).
*/

/** Botão "Como usar" no topo de cada aba. */
export function HowToButton({ href }: { href: string }) {
  return (
    <Button variant="outline" asChild>
      <Link href={href}>
        <BookOpenIcon /> Como usar
      </Link>
    </Button>
  );
}

export type TutorialSection = { id: string; label: string };

/** Página de tutorial: cabeçalho com "Voltar", índice lateral e o conteúdo. */
export function TutorialPage({
  title,
  description,
  backHref,
  backLabel,
  sections,
  children,
}: {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  sections: readonly TutorialSection[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button variant="outline" asChild>
            <Link href={backHref}>
              <ArrowLeftIcon /> {backLabel}
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-label="Neste tutorial"
          className="flex flex-wrap gap-1.5 self-start lg:sticky lg:top-24 lg:flex-col lg:gap-0.5"
        >
          <span className="text-label-secondary hidden px-2.5 pb-1 text-[12px] font-semibold tracking-[0.08em] uppercase lg:block">
            Neste tutorial
          </span>
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="bg-tile lg:text-label-secondary hover:text-foreground lg:hover:bg-tile rounded-full px-3 py-1 text-[13px] transition-colors lg:rounded-lg lg:bg-transparent lg:px-2.5"
            >
              {s.label}
            </a>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-12">{children}</div>
      </div>
    </div>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3">
      {eyebrow && (
        <span className="text-system-blue text-[12px] font-semibold tracking-[0.08em] uppercase">
          {eyebrow}
        </span>
      )}
      <h2 className="text-[22px] font-bold tracking-[-0.02em] text-balance">{title}</h2>
      <div className="flex max-w-[68ch] flex-col gap-3 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

/** Subtítulo dentro de uma seção. */
export function Sub({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-1 text-[16px] font-semibold">{children}</h3>;
}

/** Lista "campo → o que é", no formato das telas de ajustes. */
export function Fields({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <Surface className="divide-foreground/[0.06] divide-y">
      {rows.map(([name, text]) => (
        <div
          key={name}
          className="grid grid-cols-[minmax(0,1fr)] gap-0.5 px-4 py-3 text-[14px] sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] sm:gap-4"
        >
          <span className="font-semibold">{name}</span>
          <span className="text-label-secondary">{text}</span>
        </div>
      ))}
    </Surface>
  );
}

export function Tip({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'warn';
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-2xl p-3.5 text-[14px]',
        tone === 'info' ? 'bg-system-blue/[0.08]' : 'bg-system-orange/10',
      )}
    >
      {tone === 'info' ? (
        <LightbulbIcon className="text-system-blue mt-0.5 size-4 shrink-0" />
      ) : (
        <InfoIcon className="text-system-orange mt-0.5 size-4 shrink-0" />
      )}
      <div>{children}</div>
    </div>
  );
}

/** Caminho na tela: "Serviços › Pacotes". */
export function Path({ items }: { items: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
      {items.map((item, i) => (
        <React.Fragment key={item}>
          {i > 0 && <span className="text-label-secondary">›</span>}
          <span className="bg-tile rounded-full px-2.5 py-0.5">{item}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

/** Passo a passo numerado (a ordem importa). */
export function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
          <span className="bg-system-blue/12 text-system-blue flex size-7 items-center justify-center rounded-full text-[13px] font-bold">
            {i + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** Lista simples com marcador. */
export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function Faq({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map(([q, a]) => (
        <details key={q} className="bg-tile rounded-2xl px-4 py-3">
          <summary className="cursor-pointer font-semibold">{q}</summary>
          <p className="text-label-secondary mt-2 text-[14px]">{a}</p>
        </details>
      ))}
    </div>
  );
}
