import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarXIcon } from 'lucide-react';

import { getBookableCompany, getBookingCatalog } from '@/server/data/public-booking';
import { BookingFlow } from '@/components/booking/booking-flow';
import { getTodayInTz } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const company = await getBookableCompany(slug);
  return { title: company ? `Agendar · ${company.name}` : 'Agendamento online' };
}

/** Página pública: o cliente marca o próprio horário, sem login. */
export default async function AgendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getBookableCompany(slug);

  if (!company) {
    return (
      <main className="font-apple flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <CalendarXIcon className="text-label-secondary size-10" />
        <h1 className="text-[22px] font-semibold">Agendamento online indisponível</h1>
        <p className="text-label-secondary max-w-sm text-[15px]">
          Este estabelecimento não está recebendo agendamentos pela internet no momento. Entre em
          contato diretamente para marcar seu horário.
        </p>
      </main>
    );
  }

  const catalog = await getBookingCatalog(company.id);

  // Ninguém com expediente confirmado: não há horário a oferecer, então nada de reservar.
  if (catalog.professionals.length === 0) {
    return (
      <main className="font-apple flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <CalendarXIcon className="text-label-secondary size-10" />
        <h1 className="text-[22px] font-semibold">Horários ainda não liberados</h1>
        <p className="text-label-secondary max-w-sm text-[15px]">
          {company.name} está terminando de configurar os horários de atendimento. Volte em breve ou
          entre em contato diretamente para marcar.
        </p>
      </main>
    );
  }

  return (
    <main className="font-apple mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <header className="flex items-end justify-between gap-3 pt-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-label-secondary text-[13px] font-medium">Agendamento online</span>
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">{company.name}</h1>
        </div>
        <Link
          href={`/cliente/entrar/${company.slug}`}
          className="text-system-blue shrink-0 pb-1 text-[13px] font-medium"
        >
          Meus horários
        </Link>
      </header>
      <BookingFlow
        slug={slug}
        services={catalog.services}
        professionals={catalog.professionals}
        today={getTodayInTz(company.timezone)}
      />
      <footer className="text-label-secondary pb-4 text-center text-[12px]">
        Agendamento por Atendafy
      </footer>
    </main>
  );
}
