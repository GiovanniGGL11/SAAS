import { MessageCircleIcon } from 'lucide-react';

/** Número de contato comercial (só dígitos, com DDI), em NEXT_PUBLIC_CONTACT_WHATSAPP. */
export function contactWhatsappLink(): string | null {
  const digits = (process.env.NEXT_PUBLIC_CONTACT_WHATSAPP ?? '').replace(/\D/g, '');
  if (digits.length < 12) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent('Olá! Quero saber mais sobre o Atendafy.')}`;
}

/** Botão flutuante "fale com a gente"; some enquanto o número não estiver configurado. */
export function WhatsappButton() {
  const href = contactWhatsappLink();
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed right-5 bottom-5 z-50 flex items-center gap-2 rounded-full bg-[#25d366] px-4 py-3 text-[15px] font-semibold text-white shadow-[0_12px_30px_-8px_rgb(37_211_102/0.6)] transition-transform hover:scale-[1.04] active:scale-[0.97]"
    >
      <MessageCircleIcon className="size-5" />
      <span className="hidden sm:inline">Fale com a gente</span>
    </a>
  );
}
