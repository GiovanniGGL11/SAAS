'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { HistoryIcon } from 'lucide-react';

import { EmptyState } from '@/components/ui/empty-state';
import { STATUS_LABELS } from '@/components/agenda/status';
import { RECORD_STATUS_LABEL, SIGNATURE_LABEL, formatDate } from '@/components/fichas/labels';
import { SessionRecordDialog } from '@/components/pacotes/session-record-dialog';
import { listClientSessionsAction } from '@/server/actions/package-actions';

/**
 * Aba "Histórico das sessões": cada atendimento com os três status separados (atendimento,
 * registro, assinatura). Cancelamentos e faltas aparecem como tentativas, sem número de sessão.
 */
export function ClientSessionsTab({ clientId, timezone }: { clientId: string; timezone: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['client-sessions', clientId],
    queryFn: () => listClientSessionsAction({ clientId }),
  });
  const [openId, setOpenId] = React.useState<string | null>(null);
  const rows = data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[17px] font-semibold">Histórico das sessões</h2>
        <p className="text-label-secondary text-[13px]">
          Registro e assinatura de cada atendimento. Toque em um atendimento para abrir.
        </p>
      </div>
      <div className="bg-tile overflow-hidden rounded-[22px]">
        {isLoading ? (
          <p className="text-label-secondary p-5 text-[14px]">Carregando…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="Nenhum atendimento ainda"
            description="Os atendimentos deste cliente aparecem aqui."
          />
        ) : (
          <ul className="divide-foreground/[0.06] divide-y">
            {rows.map((row) => {
              const attempt =
                row.appointmentStatus === 'CANCELED' || row.appointmentStatus === 'NO_SHOW';
              const done = row.appointmentStatus === 'DONE';
              return (
                <li key={row.appointmentId}>
                  <button
                    type="button"
                    onClick={() => setOpenId(row.appointmentId)}
                    className="hover:bg-foreground/[0.03] flex w-full flex-col gap-1 px-5 py-3.5 text-left transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-medium">
                        {row.package?.sessionNumber
                          ? `Sessão ${row.package.sessionNumber} de ${row.package.sessionsTotal}`
                          : row.serviceName}
                      </span>
                      <span className="text-label-secondary text-[13px]">
                        {formatDate(row.startAt, timezone, true)} · {row.professionalName}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[12px]">
                      <Chip tone={attempt ? 'gray' : done ? 'green' : 'blue'}>
                        {STATUS_LABELS[row.appointmentStatus]}
                        {attempt && row.package ? ' — não consumiu sessão' : ''}
                      </Chip>
                      {!attempt && (
                        <Chip tone={row.recordStatus ? 'gray' : done ? 'amber' : 'gray'}>
                          {row.recordStatus
                            ? RECORD_STATUS_LABEL[row.recordStatus]
                            : 'Sem registro'}
                        </Chip>
                      )}
                      {row.signature && row.signature !== 'not_required' && (
                        <Chip tone={row.signature === 'pending' ? 'amber' : 'green'}>
                          {done && row.signature === 'pending'
                            ? 'Realizada — assinatura pendente'
                            : SIGNATURE_LABEL[row.signature]}
                        </Chip>
                      )}
                      {row.package && (
                        <Chip tone="gray">
                          {row.package.name}
                          {row.package.planned && !attempt ? ' (agendada)' : ''}
                        </Chip>
                      )}
                    </div>
                    {row.summary && (
                      <p className="text-label-secondary line-clamp-2 text-[13px]">{row.summary}</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <SessionRecordDialog
        appointmentId={openId}
        open={!!openId}
        onOpenChange={(o) => !o && setOpenId(null)}
        timezone={timezone}
      />
    </section>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'gray' | 'green' | 'blue' | 'amber';
}) {
  const cls = {
    gray: 'bg-foreground/[0.06] text-label-secondary',
    green: 'bg-system-green/15 text-[#1f7a35] dark:text-system-green',
    blue: 'bg-system-blue/12 text-system-blue',
    amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  }[tone];
  return (
    <span className={`inline-flex h-5 items-center rounded-full px-2 font-medium ${cls}`}>
      {children}
    </span>
  );
}
