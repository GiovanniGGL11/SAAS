'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardListIcon } from 'lucide-react';

import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { EntryDialog, type EntrySummary, useFormAccess } from '@/components/fichas/entry-dialog';
import { EntryStatusBadge } from '@/components/fichas/entry-status-badge';
import { SessionRecordDialog } from '@/components/pacotes/session-record-dialog';
import {
  getAppointmentFormsAction,
  requestAppointmentFormsAction,
} from '@/server/actions/form-actions';

const SOURCE_LABEL = {
  service: 'pelo serviço',
  package_initial: 'ficha inicial do pacote',
  package_session: 'ficha da sessão do pacote',
} as const;

/**
 * Fichas do atendimento no painel da agenda: o que é exigido, o que falta e o caminho para
 * resolver (pedir, abrir, gerar link). A exigência é conferida de novo no servidor ao iniciar.
 */
export function AppointmentForms({
  appointmentId,
  clientId,
  clientName,
  canceled,
  timezone,
}: {
  appointmentId: string;
  clientId: string;
  clientName: string;
  canceled: boolean;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const { data: access } = useFormAccess();
  const { data: items } = useQuery({
    queryKey: ['appointment-forms', appointmentId],
    queryFn: () => getAppointmentFormsAction(appointmentId).then(unwrapResult),
  });
  const [openEntry, setOpenEntry] = React.useState<EntrySummary | null>(null);
  const [recordOpen, setRecordOpen] = React.useState(false);

  const request = useMutation({
    mutationFn: () => requestAppointmentFormsAction(appointmentId).then(unwrapResult),
    onSuccess: () => {
      toast.success('Fichas pedidas.');
      queryClient.invalidateQueries({ queryKey: ['appointment-forms', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['client-entries', clientId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = items ?? [];
  const missing = list.filter((i) => !i.entry);
  const pendingRequired = list.filter((i) => !i.met);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ClipboardListIcon className="size-3.5" /> Fichas e registro
        </span>
        <Link
          href={`/clientes/${clientId}?aba=fichas`}
          className="text-system-blue text-[12px] hover:underline"
        >
          Fichas do cliente
        </Link>
      </div>
      {list.length === 0 ? (
        <p className="text-label-secondary text-[13px]">
          Nenhuma ficha exigida para este atendimento.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((item) => (
            <li
              key={item.templateId}
              className="bg-foreground/[0.03] flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[13px]"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{item.templateName}</div>
                <div className="text-label-secondary text-[12px]">
                  {SOURCE_LABEL[item.source]}
                  {item.requirement === 'SUBMITTED' && ' · exigida enviada para iniciar'}
                  {item.requirement === 'REVIEWED' && ' · exigida revisada para iniciar'}
                </div>
              </div>
              {item.entry ? (
                <>
                  <EntryStatusBadge status={item.entry.status} />
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      setOpenEntry({
                        id: item.entry!.id,
                        status: item.entry!.status,
                        template: { name: item.templateName, type: item.type },
                        client: { name: clientName },
                        fillableBy: item.fillableBy,
                      })
                    }
                  >
                    Abrir
                  </Button>
                </>
              ) : (
                <span className="text-label-secondary text-[12px]">Não pedida</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {pendingRequired.length > 0 && !canceled && (
        <p className="text-[12px] text-amber-800 dark:text-amber-300">
          Para iniciar o atendimento, resolva as fichas exigidas acima (o agendamento não é
          cancelado).
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {missing.length > 0 && !canceled && access?.canRequest && (
          <Button
            size="sm"
            variant="outline"
            disabled={request.isPending}
            onClick={() => request.mutate()}
          >
            Pedir {missing.length === 1 ? 'a ficha' : `as ${missing.length} fichas`}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setRecordOpen(true)}>
          Registro da sessão
        </Button>
      </div>
      <EntryDialog
        entry={openEntry}
        open={!!openEntry}
        onOpenChange={(o: boolean) => !o && setOpenEntry(null)}
        timezone={timezone}
      />
      <SessionRecordDialog
        appointmentId={recordOpen ? appointmentId : null}
        open={recordOpen}
        onOpenChange={setRecordOpen}
        timezone={timezone}
      />
    </div>
  );
}
