'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GoogleIcon } from '@/components/auth/provider-icons';
import {
  disconnectGoogleCalendarAction,
  getGoogleCalendarStatusAction,
  setGoogleCalendarProfessionalsAction,
} from '@/server/actions/google-calendar-actions';
import type { SerializedProfessional } from '@/lib/serialize';

const RETURN_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Google Agenda conectado. Seus agendamentos estão sendo copiados.' },
  denied: { ok: false, text: 'Conexão cancelada: você não autorizou o acesso ao Google Agenda.' },
  unavailable: { ok: false, text: 'A integração com o Google Agenda ainda não foi configurada.' },
  error: { ok: false, text: 'Não foi possível conectar ao Google Agenda. Tente de novo.' },
};

const STATUS_KEY = ['google-calendar-status'];

/**
 * Entry to opt in to mirroring your professionals' appointments to Google. `row` is the card in the
 * agenda sidebar; `chip` is the pill shown under the agenda toolbar on phones, where the sidebar
 * lives inside the filters sheet.
 */
export function GoogleCalendarCard({
  professionals,
  variant = 'row',
}: {
  professionals: SerializedProfessional[];
  variant?: 'row' | 'chip';
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const { data: status } = useQuery({
    queryKey: STATUS_KEY,
    queryFn: getGoogleCalendarStatusAction,
  });

  // Google sends the user back to /agenda?google=<result>; say how it went, then clean the URL.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('google');
    if (!result) return;
    url.searchParams.delete('google');
    window.history.replaceState(null, '', url);

    const message = RETURN_MESSAGES[result];
    if (message) (message.ok ? toast.success : toast.error)(message.text);
    void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
  }, [queryClient]);

  function openDialog() {
    setSelected(new Set(status?.professionalIds ?? []));
    setOpen(true);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const save = useMutation({
    mutationFn: () => setGoogleCalendarProfessionalsAction([...selected]).then(unwrapResult),
    onSuccess: () => {
      toast.success('Profissionais atualizados.');
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectGoogleCalendarAction().then(unwrapResult),
    onSuccess: () => {
      toast.success('Google Agenda desconectado. Os eventos já copiados continuam lá.');
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function startConnect() {
    window.location.href = `/api/google-calendar/connect?professionals=${[...selected].join(',')}`;
  }

  if (!status) return null;

  const connected = status.connected && !status.needsReconnect;
  const hint = !status.configured
    ? 'Indisponível'
    : status.needsReconnect
      ? 'Reconectar'
      : status.connected
        ? 'Conectado'
        : 'Sincronizar';

  return (
    <>
      {variant === 'chip' ? (
        <button
          type="button"
          onClick={openDialog}
          aria-label={`Google Agenda: ${hint}`}
          className="bg-foreground/[0.05] active:bg-foreground/[0.1] flex w-fit items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-[13px] font-medium transition-colors"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
            <GoogleIcon />
          </span>
          Google Agenda
          <span
            className={cn(
              'flex items-center gap-1 text-[12px] font-normal',
              status.needsReconnect ? 'text-system-red' : 'text-label-secondary',
            )}
          >
            {connected && <span className="bg-system-green inline-block size-1.5 rounded-full" />}
            {hint}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={openDialog}
          className="bg-foreground/[0.05] hover:bg-foreground/[0.08] flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition-colors"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-white shadow-sm">
            <GoogleIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium">Google Agenda</span>
            <span
              className={cn(
                'block text-[12px]',
                status.needsReconnect ? 'text-system-red' : 'text-label-secondary',
              )}
            >
              {connected && (
                <span className="bg-system-green mr-1 inline-block size-1.5 rounded-full" />
              )}
              {hint}
            </span>
          </span>
          <ChevronRightIcon className="text-label-secondary/60 size-4 shrink-0" />
        </button>
      )}

      <Dialog open={open} onOpenChange={(next: boolean) => setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Google Agenda</DialogTitle>
            <DialogDescription>
              {status.connected
                ? `Conectado como ${status.email}. Os agendamentos dos profissionais escolhidos aparecem no seu calendário e acompanham remarcações e cancelamentos.`
                : 'Escolha os profissionais cujos agendamentos devem aparecer no seu Google Agenda. Você pode desconectar quando quiser.'}
            </DialogDescription>
          </DialogHeader>

          {!status.configured ? (
            <p className="bg-foreground/[0.05] rounded-2xl px-4 py-3 text-[13px]">
              A integração ainda não foi configurada neste sistema. Peça ao administrador para
              adicionar as credenciais do Google.
            </p>
          ) : (
            <>
              {status.needsReconnect && (
                <p className="bg-system-red/10 text-system-red rounded-2xl px-4 py-3 text-[13px]">
                  O Google desfez a autorização (ou ela expirou). Reconecte para voltar a
                  sincronizar.
                </p>
              )}

              <fieldset className="flex flex-col gap-1">
                <legend className="text-label-secondary mb-1 text-[12px] font-semibold uppercase">
                  Profissionais no meu calendário
                </legend>
                {professionals.length === 0 ? (
                  <p className="text-label-secondary text-[13px]">
                    Cadastre um profissional para poder sincronizar.
                  </p>
                ) : (
                  professionals.map((professional) => {
                    const checked = selected.has(professional.id);
                    return (
                      <button
                        key={professional.id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggle(professional.id)}
                        className="hover:bg-foreground/[0.05] flex items-center gap-2.5 rounded-lg px-1 py-2 text-left text-[14px]"
                      >
                        <span
                          className="flex size-[20px] shrink-0 items-center justify-center rounded-[6px] border-2"
                          style={{
                            borderColor: professional.color,
                            backgroundColor: checked ? professional.color : 'transparent',
                          }}
                        >
                          {checked && <CheckIcon className="size-3.5 text-white" strokeWidth={3} />}
                        </span>
                        {professional.name}
                      </button>
                    );
                  })
                )}
              </fieldset>

              <DialogFooter className="sm:justify-between">
                {status.connected ? (
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate()}
                  >
                    Desconectar
                  </Button>
                ) : (
                  <span />
                )}
                {status.connected && !status.needsReconnect ? (
                  <Button disabled={save.isPending} onClick={() => save.mutate()}>
                    {save.isPending ? 'Salvando…' : 'Salvar'}
                  </Button>
                ) : (
                  <Button disabled={selected.size === 0} onClick={startConnect}>
                    <GoogleIcon />
                    {status.needsReconnect ? 'Reconectar com Google' : 'Conectar com Google'}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
