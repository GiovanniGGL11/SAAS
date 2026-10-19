'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HourglassIcon, MessageCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

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
import {
  createWaitlistOfferAction,
  getWaitlistCapabilitiesAction,
} from '@/server/actions/waitlist-actions';

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
  const queryClient = useQueryClient();
  const { data: caps } = useQuery({
    queryKey: ['waitlist-capabilities'],
    queryFn: getWaitlistCapabilitiesAction,
    staleTime: 5 * 60_000,
  });
  const [inviting, setInviting] = React.useState<string | null>(null);
  // Convite com prazo: guarda o horário para UMA pessoa (as outras não recebem nada).
  const invite = async (match: FreedSlotMatch) => {
    setInviting(match.entryId);
    const result = await createWaitlistOfferAction({
      entryId: match.entryId,
      professionalId: match.professionalId,
      startAt: match.startAt,
      responseMinutes: 120,
    });
    setInviting(null);
    if (!result.ok) {
      toast.error(result.error, { duration: 9000 });
      return;
    }
    toast.success('Horário guardado por 2 horas para esta pessoa.');
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
    queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    setMatches(null);
    if (result.data.whatsappUrl) window.open(result.data.whatsappUrl, '_blank', 'noreferrer');
  };
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
              {caps?.invites
                ? 'Convide uma pessoa por vez: o horário fica guardado para ela até responder.'
                : 'Chame pelo WhatsApp; quem responder primeiro fica com a vaga.'}
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
                  {caps?.invites ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={inviting !== null}
                      onClick={() => invite(match)}
                    >
                      <HourglassIcon className="size-3.5" />
                      {inviting === match.entryId ? 'Guardando…' : 'Convidar'}
                    </Button>
                  ) : link ? (
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
