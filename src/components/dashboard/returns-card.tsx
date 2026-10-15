import Link from 'next/link';
import { MessageCircleIcon, RepeatIcon } from 'lucide-react';

import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { whatsappLink } from '@/lib/phone';

export type ReturnItem = {
  clientId: string;
  name: string;
  phone: string | null;
  serviceName: string;
  daysLate: number;
  message: string;
};

function dueLabel(daysLate: number) {
  if (daysLate > 1) return `retorno atrasado ${daysLate} dias`;
  if (daysLate === 1) return 'retorno era ontem';
  if (daysLate === 0) return 'retorno é hoje';
  if (daysLate === -1) return 'retorno é amanhã';
  return `retorno em ${-daysLate} dias`;
}

/**
 * Retorno por serviço: quem está na hora de voltar, conforme o intervalo de cada serviço, com a
 * mensagem pronta no WhatsApp. Sem serviço configurado, explica como ligar em vez de ficar vazio.
 */
export function ReturnsCard({
  items,
  total,
  configured,
}: {
  items: ReturnItem[];
  total: number;
  /** Algum serviço ativo tem "retorno sugerido" preenchido. */
  configured: boolean;
}) {
  return (
    <AppleTile interactive={false} className="flex flex-col gap-3 p-5 md:p-6">
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-center gap-2">
          <RepeatIcon className="text-system-blue size-4" />
          <TileEyebrow>Hora de voltar</TileEyebrow>
        </div>
        {total > items.length && (
          <span className="text-label-secondary text-[12px]">mais {total - items.length}</span>
        )}
      </div>

      {!configured ? (
        <div className="flex flex-col gap-1">
          <p className="text-[14px] font-medium">Defina o retorno dos serviços</p>
          <p className="text-label-secondary text-[13px]">
            Em{' '}
            <Link href="/servicos" className="text-system-blue font-medium hover:underline">
              Serviços
            </Link>
            , diga em quantos dias cada um costuma ser refeito. Quem estiver na hora de voltar
            aparece aqui, com a mensagem pronta.
          </p>
        </div>
      ) : items.length === 0 ? (
        <p className="text-label-secondary text-[14px]">
          Ninguém na hora de voltar nos próximos dias.
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => {
            const link = whatsappLink(item.phone, item.message);
            return (
              <li
                key={item.clientId}
                className="border-foreground/[0.06] flex items-center gap-3 border-t py-2.5 first:border-t-0"
              >
                <Link
                  href={`/clientes/${item.clientId}`}
                  className="min-w-0 flex-1 hover:underline"
                >
                  <div className="truncate text-[14px] font-medium">{item.name}</div>
                  <div
                    className={
                      item.daysLate > 0
                        ? 'truncate text-[12px] text-[#b25f00] dark:text-[#ffb340]'
                        : 'text-label-secondary truncate text-[12px]'
                    }
                  >
                    {item.serviceName} · {dueLabel(item.daysLate)}
                  </div>
                </Link>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-system-green bg-system-green/12 hover:bg-system-green/20 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors"
                  >
                    <MessageCircleIcon className="size-3.5" />
                    WhatsApp
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AppleTile>
  );
}
