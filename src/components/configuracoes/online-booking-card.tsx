'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CopyIcon, ExternalLinkIcon } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { unwrapResult } from '@/lib/action-result';
import { setOnlineBookingAction } from '@/server/actions/public-booking-actions';

/** Liga o link público onde o cliente marca sozinho, e mostra o link para divulgar. */
export function OnlineBookingCard({
  initialEnabled,
  withoutSchedule,
  url,
}: {
  initialEnabled: boolean;
  /** Profissionais ativos sem expediente: ficam de fora do link até o horário ser definido. */
  withoutSchedule: string[];
  url: string;
}) {
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const mutation = useMutation({
    mutationFn: (next: boolean) => setOnlineBookingAction({ enabled: next }).then(unwrapResult),
    onSuccess: ({ enabled: next }) => {
      setEnabled(next);
      toast.success(next ? 'Agendamento online ligado.' : 'Agendamento online desligado.');
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
  });

  return (
    <section className="bg-tile flex flex-col gap-4 rounded-[22px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold">Agendamento online</h2>
          <p className="text-label-secondary text-[13px]">
            Seus clientes escolhem serviço, profissional e horário sozinhos, por um link. Os
            horários respeitam o expediente e a agenda de cada profissional.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={mutation.isPending}
          onCheckedChange={(next: boolean) => mutation.mutate(next)}
          aria-label="Agendamento online"
        />
      </div>
      {withoutSchedule.length > 0 && (
        <p className="rounded-xl bg-[#ff9f0a]/12 px-4 py-3 text-[13px] text-[#8a4b00] dark:text-[#ffb340]">
          <span className="font-semibold">Expediente pendente:</span> {withoutSchedule.join(', ')}{' '}
          {withoutSchedule.length === 1 ? 'não aparece' : 'não aparecem'} no link público até você
          definir o horário de atendimento em{' '}
          <a href="/profissionais" className="font-semibold underline">
            Profissionais
          </a>
          .
        </p>
      )}
      {enabled && (
        <div className="bg-background ring-foreground/[0.06] flex flex-wrap items-center gap-2 rounded-xl p-3 ring-1">
          <code className="min-w-0 flex-1 truncate text-[13px]">{url}</code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              toast.success('Link copiado. Coloque na bio do Instagram e no WhatsApp.');
            }}
          >
            <CopyIcon className="size-4" /> Copiar
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon className="size-4" /> Abrir
            </a>
          </Button>
        </div>
      )}
    </section>
  );
}
