'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';

import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { LINKS } from '@/components/landing/landing-links';

/** Frosted sticky header that gains a hairline border once the page scrolls. */
export function LandingHeader() {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-[background-color,border-color] duration-300',
        scrolled
          ? 'bg-background/72 border-foreground/[0.08] backdrop-blur-xl backdrop-saturate-[1.8]'
          : 'border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Image src="/images/logo.png" alt="" width={28} height={28} className="size-7" />
          <span>
            Atenda<span className="text-system-blue">fy</span>
          </span>
        </Link>
        <nav aria-label="Seções" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-foreground/70 hover:text-foreground rounded-full px-3 py-1.5 text-sm transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <nav className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Link
            href="/sign-in"
            className="text-foreground/80 hover:text-foreground rounded-full px-3 py-1.5 text-sm transition-colors"
          >
            Entrar
          </Link>
          <Link
            href="/sign-up"
            className="bg-foreground text-background rounded-full px-4 py-1.5 text-sm font-medium transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Criar conta
          </Link>
        </nav>
      </div>
    </header>
  );
}
