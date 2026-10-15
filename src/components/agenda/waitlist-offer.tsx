'use client';

import * as React from 'react';
import { MessageCircleIcon } from 'lucide-react';

import { whatsappLink } from '@/lib/phone';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FreedSlotMatch } from '@/server/data/waitlist';

const OfferContext = React.createContext<(matches: FreedSlotMatch[]) => void>(() => {});

/** Depois de um cancelamento: chama quem da lista de espera combina com a vaga que abriu. */
export function useOfferFreedSlot() {
  return React.useContext(OfferContext);
}

/**
 * Fica acima dos cartões da agenda: o cartão do agendamento fecha ao cancelar, e o aviso de
 * "abriu uma vaga" precisa continuar na tela.
 */
export function WaitlistOfferProvider({ children }: { children: React.ReactNode }) {
  const [matches, setMatches] = React.useState<FreedSlotMatch[] | null>(null);
  const offer = React.useCallback((next: FreedSlotMatch[]) => {
    if (next.length > 0) setMatches(next);
  }, []);

  const label = matches?.[0]?.label;
  return (
    <OfferContext.Provider value={offer}>
      {children}
      <Dialog open={matches !== null} onOpenChange={(open: boolean) => !open && setMatches(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abriu uma vaga{label ? ` às ${label}` : ''}</DialogTitle>
            <DialogDescription>
              {matches?.length === 1
                ? '1 pessoa da lista de espera combina com este horário.'
                : `${matches?.length ?? 0} pessoas da lista de espera combinam com este horário.`}{' '}
              Chame pelo WhatsApp; quem responder primeiro fica com a vaga.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {matches?.map((match) => {
              const link = whatsappLink(match.phone, match.message);
              return (
                <li
                  key={match.entryId}
                  className="bg-foreground/[0.04] flex items-center gap-3 rounded-2xl p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{match.clientName}</div>
                    <div className="text-label-secondary truncate text-[13px]">
                      {match.serviceName} · {match.label}
                    </div>
                  </div>
                  {link ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={link} target="_blank" rel="noreferrer">
                        <MessageCircleIcon className="size-3.5" /> Oferecer
                      </a>
                    </Button>
                  ) : (
                    <span className="text-label-secondary text-[12px]">sem celular</span>
                  )}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </OfferContext.Provider>
  );
}
