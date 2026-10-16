import type { Metadata } from 'next';
import { CalendarXIcon } from 'lucide-react';

import {
  BOOKING_DAYS_AHEAD,
  getBookableCompany,
  getBookingCatalog,
} from '@/server/data/public-booking';
import { BookingFlow } from '@/components/booking/booking-flow';
import { BookingHeader } from '@/components/booking/booking-header';
import { getTodayInTz } from '@/lib/time';
import { formatAddress, mapsSearchLink } from '@/lib/address';
import { whatsappLink } from '@/lib/phone';
import { BRAZIL_TIMEZONES } from '@/lib/validations/company';

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

function Unavailable({ title, text }: { title: string; text: string }) {
  return (
    <main className="font-apple bg-tile flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <CalendarXIcon className="text-label-secondary size-10" />
      <h1 className="text-[22px] font-semibold">{title}</h1>
      <p className="text-label-secondary max-w-sm text-[15px]">{text}</p>
    </main>
  );
}

/** "fuso de Brasília (UTC-3)" — o fuso da empresa, nunca o do aparelho de quem agenda. */
function timezoneLabel(timezone: string) {
  const known = BRAZIL_TIMEZONES.find((t) => t.value === timezone);
  return known ? `fuso de ${known.label}` : `fuso ${timezone}`;
}

/** Página pública: o cliente marca o próprio horário, sem login. */
export default async function AgendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getBookableCompany(slug);

  if (!company) {
    return (
      <Unavailable
        title="Agendamento online indisponível"
        text="Este estabelecimento não está recebendo agendamentos pela internet no momento. Entre em contato diretamente para marcar seu horário."
      />
    );
  }

  const catalog = await getBookingCatalog(company.id);
  // Ninguém com expediente confirmado: não há horário a oferecer, então nada de reservar.
  if (catalog.professionals.length === 0) {
    return (
      <Unavailable
        title="Horários ainda não liberados"
        text={`${company.name} está terminando de configurar os horários de atendimento. Volte em breve ou entre em contato diretamente para marcar.`}
      />
    );
  }

  const address = formatAddress(company) || null;
  // Resumo para o cabeçalho: bairro e cidade; o endereço completo fica em "Ver localização".
  const cityLine = [company.city, company.state].filter(Boolean).join('/');
  const locationShort = [company.district, cityLine].filter(Boolean).join(' · ') || address;
  const mapUrl = mapsSearchLink(company);
  const chatUrl = whatsappLink(company.whatsapp, 'Olá! Vim pelo link de agendamento.');

  return (
    <main className="font-apple bg-tile flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-6 px-4 py-5 sm:px-6 sm:py-8">
        <BookingHeader
          name={company.name}
          slug={company.slug}
          logoUrl={company.logoUrl}
          locationShort={locationShort}
          address={address}
          mapUrl={mapUrl}
          instagram={company.instagram}
        />
        <BookingFlow
          company={{
            name: company.name,
            slug: company.slug,
            timezone: company.timezone,
            timezoneLabel: timezoneLabel(company.timezone),
            address,
            mapUrl,
            cancellationPolicy: company.cancellationPolicy,
            // Sinal por PIX: só quando o salão ligou e conectou a conta Asaas.
            depositPercent: company.asaasApiKey ? company.depositPercent : 0,
          }}
          services={catalog.services}
          professionals={catalog.professionals}
          today={getTodayInTz(company.timezone)}
          bookingDays={BOOKING_DAYS_AHEAD}
        />
        <footer className="text-label-secondary flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pb-2 text-center text-[12px]">
          {chatUrl && (
            <a href={chatUrl} target="_blank" rel="noreferrer" className="hover:underline">
              Dúvidas? Fale com {company.name} pelo WhatsApp
            </a>
          )}
          <span>Agendamento por Atendafy</span>
        </footer>
      </div>
    </main>
  );
}
