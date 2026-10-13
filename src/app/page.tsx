import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';

import { LandingHeader } from '@/components/landing/landing-header';
import { Hero } from '@/components/landing/hero';
import { ProductPreview } from '@/components/landing/product-preview';
import { FeatureGrid } from '@/components/landing/feature-grid';
import { Faq } from '@/components/landing/faq';

export default function Home() {
  return (
    <div className="font-apple flex flex-1 flex-col">
      <LandingHeader />
      <main className="flex-1">
        <Hero />
        <ProductPreview />
        <FeatureGrid />
        <Faq />

        <section className="px-5 pb-24 md:pb-32">
          <div className="bg-tile relative isolate mx-auto max-w-6xl overflow-hidden rounded-[32px] px-6 py-16 text-center md:py-24">
            <div
              aria-hidden
              className="bg-system-blue/20 animate-aurora pointer-events-none absolute -top-24 left-1/2 -z-10 size-[30rem] -translate-x-1/2 rounded-full blur-[100px]"
            />
            <h2 className="mx-auto max-w-2xl text-[34px] leading-[1.1] font-bold tracking-[-0.03em] text-balance md:text-[48px]">
              Comece hoje. Seu negócio agradece.
            </h2>
            <p className="text-label-secondary mx-auto mt-4 max-w-md text-[17px] text-balance">
              Crie sua conta em poucos minutos e organize toda a operação em um só lugar.
            </p>
            <Link
              href="/sign-up"
              className="bg-system-blue group mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3 text-[17px] font-medium text-white shadow-[0_10px_30px_-10px_var(--system-blue)] transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Criar conta
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-foreground/[0.06] border-t">
        <div className="text-label-secondary mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-[13px] sm:flex-row">
          <span>© {new Date().getFullYear()} Atendafy</span>
          <span>Gestão completa para negócios baseados em agendamento.</span>
        </div>
      </footer>
    </div>
  );
}
