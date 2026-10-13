import { CalendarPlusIcon, LockKeyholeIcon, MessageCircleIcon } from 'lucide-react';

import { whatsappLink } from '@/lib/phone';
import { Button } from '@/components/ui/button';

/**
 * Quem chega sem um link válido: explica que o acesso é pelo link pessoal e, sabendo a empresa,
 * leva direto para o WhatsApp dela com o pedido escrito.
 */
export function RequestAccess({
  company,
  expired = false,
  bookingUrl,
}: {
  company: { name: string; whatsapp: string | null } | null;
  expired?: boolean;
  bookingUrl?: string | null;
}) {
  const askUrl = company
    ? whatsappLink(
        company.whatsapp,
        `Olá! Quero acessar minha área de cliente na ${company.name}. Pode me mandar o link?`,
      )
    : null;

  const text = !company
    ? 'Abra o link pessoal que o estabelecimento te mandou pelo WhatsApp. Se não encontrar a mensagem, peça um novo link a eles.'
    : expired
      ? `Por segurança, ${company.name} gerou um link novo para você e este deixou de valer. Peça o link atualizado.`
      : `Para ver, remarcar ou cancelar seus horários, use o link pessoal que ${company.name} manda pelo WhatsApp. Ainda não recebeu? É só pedir.`;

  return (
    <main className="font-apple mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <div className="bg-tile flex flex-col items-center gap-4 rounded-[22px] p-7 text-center">
        <span className="bg-system-blue/12 text-system-blue flex size-14 items-center justify-center rounded-2xl">
          <LockKeyholeIcon className="size-7" />
        </span>
        <div className="flex flex-col gap-1">
          {company && <p className="text-label-secondary text-[13px]">{company.name}</p>}
          <h1 className="text-[22px] leading-tight font-semibold">
            {expired ? 'Este link foi trocado' : 'Área do cliente'}
          </h1>
        </div>
        <p className="text-label-secondary text-[15px]">{text}</p>

        {askUrl ? (
          <Button asChild size="lg" className="w-full">
            <a href={askUrl}>
              <MessageCircleIcon className="size-5" />
              Pedir acesso pelo WhatsApp
            </a>
          </Button>
        ) : (
          company && (
            <p className="bg-foreground/[0.05] w-full rounded-2xl px-4 py-3 text-[13px]">
              Peça o link no atendimento, na sua próxima visita ou pelo contato de sempre.
            </p>
          )
        )}
        {bookingUrl && (
          <Button asChild variant="ghost" className="w-full">
            <a href={bookingUrl}>
              <CalendarPlusIcon className="size-4" />
              Agendar um horário
            </a>
          </Button>
        )}
      </div>
      <footer className="text-label-secondary text-center text-[12px]">Atendafy</footer>
    </main>
  );
}
