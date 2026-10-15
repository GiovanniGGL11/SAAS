import type { Metadata } from 'next';
import Link from 'next/link';
import { AtSignIcon, CalendarXIcon, MapPinIcon, MessageCircleIcon } from 'lucide-react';

import { getBookableCompany, getBookingCatalog } from '@/server/data/public-booking';
import { BookingFlow } from '@/components/booking/booking-flow';
import { getTodayInTz } from '@/lib/time';
import { formatAddress, mapsSearchLink } from '@/lib/address';
import { whatsappLink } from '@/lib/phone';

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

  const address = formatAddress(company);
  const mapUrl = mapsSearchLink(company);
  const chatUrl = whatsappLink(company.whatsapp, 'Olá! Vim pelo link de agendamento.');
  const initials = company.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <main className="font-apple mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-4 sm:p-8">
      {/* Identidade da empresa: logo, nome, endereço e contatos antes de escolher o horário. */}
      <header className="flex flex-col gap-4 pt-2">
        <div className="flex items-center gap-3">
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo hospedada pelo Clerk
            <img
              src={company.logoUrl}
              alt={`Logo de ${company.name}`}
              className="ring-foreground/[0.08] size-14 shrink-0 rounded-2xl object-cover ring-1"
            />
          ) : (
            <span className="bg-system-blue flex size-14 shrink-0 items-center justify-center rounded-2xl text-[20px] font-bold text-white">
              {initials}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-label-secondary text-[13px] font-medium">Agendamento online</span>
            <h1 className="truncate text-[26px] leading-tight font-bold tracking-[-0.02em]">
              {company.name}
            </h1>
          </div>
          <Link
            href={`/cliente/entrar/${company.slug}`}
            className="text-system-blue shrink-0 self-start pt-1 text-[13px] font-medium"
          >
            Meus horários
          </Link>
        </div>

        {(address || chatUrl || company.instagram) && (
          <div className="flex flex-col gap-2">
            {address &&
              (mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-label-secondary flex items-start gap-2 text-[14px] hover:underline"
                >
                  <MapPinIcon className="mt-0.5 size-4 shrink-0" />
                  {address}
                </a>
              ) : (
                <span className="text-label-secondary flex items-start gap-2 text-[14px]">
                  <MapPinIcon className="mt-0.5 size-4 shrink-0" />
                  {address}
                </span>
              ))}
            <div className="flex flex-wrap gap-2">
              {chatUrl && (
                <a
                  href={chatUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-system-green bg-system-green/12 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold"
                >
                  <MessageCircleIcon className="size-4" />
                  WhatsApp
                </a>
              )}
              {company.instagram && (
                <a
                  href={`https://instagram.com/${company.instagram}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-foreground/[0.06] flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold"
                >
                  <AtSignIcon className="size-4" />
                  {company.instagram}
                </a>
              )}
            </div>
          </div>
        )}
      </header>
      <BookingFlow
        slug={slug}
        services={catalog.services}
        professionals={catalog.professionals}
        today={getTodayInTz(company.timezone)}
        cancellationPolicy={company.cancellationPolicy}
      />
      <footer className="text-label-secondary pb-4 text-center text-[12px]">
        Agendamento por Atendafy
      </footer>
    </main>
  );
}
