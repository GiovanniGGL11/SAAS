'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { cn } from '@/lib/utils';
import { FINANCIAL_STATUS_LABEL } from '@/lib/packages';
import { listCompatiblePackagesAction } from '@/server/actions/package-actions';

/**
 * Ao agendar: os pacotes do cliente que servem para os serviços escolhidos. Nada é escolhido
 * sozinho — "Avulso" é o padrão, a menos que a pessoa tenha vindo de "Agendar sessão" do pacote.
 */
export function PackagePicker({
  clientId,
  serviceIds,
  at,
  value,
  onChange,
}: {
  clientId: string;
  serviceIds: string[];
  at: Date | null;
  value: string | null;
  onChange: (packageId: string | null) => void;
}) {
  const enabled = !!clientId && serviceIds.length > 0 && !!at;
  const { data } = useQuery({
    queryKey: [
      'compatible-packages',
      clientId,
      serviceIds.join(','),
      at?.toISOString().slice(0, 10),
    ],
    queryFn: () => listCompatiblePackagesAction({ clientId, serviceIds, at: at! }),
    enabled,
  });
  if (!enabled || !data || data.length === 0) return null;

  const option = (
    id: string | null,
    title: React.ReactNode,
    detail: React.ReactNode,
    disabled = false,
  ) => {
    const checked = value === id;
    return (
      <label
        key={id ?? 'avulso'}
        className={cn(
          'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 text-[13px] ring-1 transition-colors',
          disabled && 'cursor-not-allowed opacity-55',
          checked ? 'bg-system-blue/10 ring-system-blue/40' : 'ring-foreground/10',
        )}
      >
        <input
          type="radio"
          name="appointment-package"
          className="accent-system-blue mt-0.5 size-4"
          checked={checked}
          disabled={disabled}
          onChange={() => onChange(id)}
        />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{title}</span>
          <span className="text-label-secondary text-[12px]">{detail}</span>
        </span>
      </label>
    );
  };

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-[14px] font-medium">Pacote</legend>
      {option(null, 'Avulso (sem pacote)', 'Cobrado normalmente na comanda.')}
      {data.map((p) =>
        option(
          p.id,
          `${p.name} · sessão ${p.done + p.planned + 1} de ${p.total}`,
          p.ok
            ? `${p.remaining} ${p.remaining === 1 ? 'restante' : 'restantes'}${p.planned ? ` · ${p.planned} já agendada(s)` : ''} · ${FINANCIAL_STATUS_LABEL[p.financialStatus]}${p.validUntil ? ` · vence ${new Intl.DateTimeFormat('pt-BR').format(new Date(p.validUntil))}` : ''}`
            : p.reason,
          !p.ok,
        ),
      )}
      {value && (
        <p className="text-label-secondary text-[12px]">
          A sessão só é descontada do pacote ao concluir o atendimento (“Concluir sessão”).
        </p>
      )}
    </fieldset>
  );
}
