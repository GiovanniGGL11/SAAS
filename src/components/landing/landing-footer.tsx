import Link from 'next/link';
import Image from 'next/image';

import { LINKS } from '@/components/landing/landing-links';
import { contactWhatsappLink } from '@/components/landing/whatsapp-button';

export function LandingFooter() {
  const whatsapp = contactWhatsappLink();
  return (
    <footer className="border-foreground/[0.06] border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 text-[14px] sm:grid-cols-2 md:grid-cols-4">
        <div className="flex flex-col gap-3 md:col-span-2">
          <Link
            href="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
          >
            <Image src="/images/logo.png" alt="" width={28} height={28} className="size-7" />
            <span>
              Atenda<span className="text-system-blue">fy</span>
            </span>
          </Link>
          <p className="text-label-secondary max-w-xs leading-relaxed">
            Agenda, agendamento online, caixa e financeiro para negócios que trabalham com hora
            marcada.
          </p>
        </div>
        <nav aria-label="Produto" className="flex flex-col gap-2">
          <span className="font-semibold">Produto</span>
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-label-secondary hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Conta" className="flex flex-col gap-2">
          <span className="font-semibold">Conta</span>
          <Link href="/sign-up" className="text-label-secondary hover:text-foreground">
            Criar conta
          </Link>
          <Link href="/sign-in" className="text-label-secondary hover:text-foreground">
            Entrar
          </Link>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="text-label-secondary hover:text-foreground"
            >
              Falar no WhatsApp
            </a>
          )}
        </nav>
      </div>
      <div className="border-foreground/[0.06] border-t">
        <div className="text-label-secondary mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-5 text-[13px] sm:flex-row">
          <span>© {new Date().getFullYear()} Atendafy</span>
          <span>Feito no Brasil, para quem trabalha com hora marcada.</span>
        </div>
      </div>
    </footer>
  );
}
