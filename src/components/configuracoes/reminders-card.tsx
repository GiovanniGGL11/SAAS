'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { Switch } from '@/components/ui/switch';
import { setRemindersByEmailAction } from '@/server/actions/reminder-actions';

/** Lembrete automático por e-mail na véspera. O WhatsApp é manual, pela Agenda. */
export function RemindersSettingsCard({
  initialEnabled,
  emailConfigured,
}: {
  initialEnabled: boolean;
  emailConfigured: boolean;
}) {
  const [enabled, setEnabled] = React.useState(initialEnabled);

  const mutation = useMutation({
    mutationFn: (next: boolean) => setRemindersByEmailAction({ enabled: next }).then(unwrapResult),
    onMutate: (next) => {
      setEnabled(next);
    },
    onSuccess: ({ enabled: saved }) =>
      toast.success(saved ? 'Lembretes por e-mail ligados.' : 'Lembretes por e-mail desligados.'),
    onError: (error: Error, next) => {
      setEnabled(!next);
      toast.error(error.message || 'Não foi possível salvar.');
    },
  });

  return (
    <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold">Lembretes de horário</h2>
          <p className="text-label-secondary text-[13px]">
            Todo dia de manhã, quem tem horário no dia seguinte e e-mail cadastrado recebe um
            lembrete com o link para confirmar ou cancelar. Para quem prefere WhatsApp, a Agenda tem
            a fila &ldquo;Lembretes&rdquo; com a mensagem pronta.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(next: boolean) => mutation.mutate(next)}
          aria-label="Enviar lembretes por e-mail"
        />
      </div>
      {enabled && !emailConfigured && (
        <p className="bg-system-orange/10 rounded-xl p-3 text-[13px]">
          O envio ainda não está ativo no servidor: cadastre <code>RESEND_API_KEY</code>,{' '}
          <code>RESEND_FROM</code> e <code>CRON_SECRET</code> nas variáveis de ambiente da Vercel.
        </p>
      )}
    </section>
  );
}
