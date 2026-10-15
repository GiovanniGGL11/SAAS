import Link from 'next/link';
import { MessageCircleIcon } from 'lucide-react';

import { AppleTile, TileEyebrow } from '@/components/dashboard/apple-tile';
import { whatsappLink } from '@/lib/phone';

type Lapsed = { id: string; name: string; phone: string | null; daysAway: number };

/** Quem não volta há mais de 60 dias, com a mensagem de reativação pronta no WhatsApp. */
export function LapsedClientsCard({
  clients,
  total,
  withHistory,
}: {
  clients: Lapsed[];
  total: number;
  /** Clientes ativos com pelo menos um atendimento concluído: a base para saber quem "sumiu". */
  withHistory: number;
}) {
  return (
    <AppleTile interactive={false} className="flex flex-col gap-3 p-5 md:p-6">
      <div className="flex items-end justify-between gap-2">
        <TileEyebrow>Chame de volta</TileEyebrow>
        {total > clients.length && (
          <Link
            href="/clientes?filtro=sumidos"
            className="text-system-blue text-[13px] font-medium hover:underline"
          >
            Ver todos ({total})
          </Link>
        )}
      </div>
      {withHistory === 0 ? (
        // Ninguém foi atendido ainda: não dá para dizer que "ninguém sumiu".
        <div className="flex flex-col gap-1">
          <p className="text-[14px] font-medium">Sem dados suficientes</p>
          <p className="text-label-secondary text-[13px]">
            Quando seus clientes tiverem atendimentos concluídos, quem passar de 60 dias sem voltar
            aparece aqui.
          </p>
        </div>
      ) : clients.length === 0 ? (
        <p className="text-label-secondary text-[14px]">
          Ninguém sumido há mais de 60 dias. Ótimo sinal.
        </p>
      ) : (
        <ul className="flex flex-col">
          {clients.map((c) => {
            const first = c.name.split(' ')[0];
            const link = whatsappLink(
              c.phone,
              `Oi, ${first}! Tudo bem? Faz um tempinho que você não vem. Que tal marcar seu próximo horário?`,
            );
            return (
              <li
                key={c.id}
                className="border-foreground/[0.06] flex items-center gap-3 border-t py-2.5 first:border-t-0"
              >
                <Link href={`/clientes/${c.id}`} className="min-w-0 flex-1 hover:underline">
                  <div className="truncate text-[14px] font-medium">{c.name}</div>
                  <div className="text-label-secondary text-[12px]">
                    Última visita há {c.daysAway} dias
                  </div>
                </Link>
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-system-green bg-system-green/12 hover:bg-system-green/20 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors"
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
