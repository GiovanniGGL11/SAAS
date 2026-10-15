'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageCheckIcon, ReceiptIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { SaleDialog } from '@/components/vendas/sale-dialog';
import {
  listClientPackagesAction,
  listOpenTabAction,
  receiveTabAction,
} from '@/server/actions/sales-actions';

const METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'CREDIT_CARD', label: 'Crédito' },
  { value: 'DEBIT_CARD', label: 'Débito' },
] as const;

/** Pacotes/assinaturas ativos do cliente e o que ele deve (fiado, mensalidade). */
export function ClientCredits({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [saleOpen, setSaleOpen] = React.useState(false);
  const [receiving, setReceiving] = React.useState<string | null>(null);
  const { data: packages } = useQuery({
    queryKey: ['client-packages', clientId],
    queryFn: () => listClientPackagesAction(clientId),
  });
  const { data: tab } = useQuery({
    queryKey: ['client-tab', clientId],
    queryFn: () => listOpenTabAction(clientId),
  });

  const receive = useMutation({
    mutationFn: (input: { transactionId: string; method: (typeof METHODS)[number]['value'] }) =>
      receiveTabAction(input).then(unwrapResult),
    onSuccess: ({ label }) => {
      toast.success(`Recebido: ${label}.`);
      setReceiving(null);
      queryClient.invalidateQueries({ queryKey: ['client-tab', clientId] });
      queryClient.invalidateQueries({ queryKey: ['cash-register'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const owed = (tab ?? []).reduce((s, t) => s + t.amount, 0);
  const dateFmt = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <PackageCheckIcon className="text-system-blue size-4" />
            Pacotes e assinaturas
          </h2>
          <Button variant="outline" size="sm" onClick={() => setSaleOpen(true)}>
            Vender
          </Button>
        </div>
        {!packages || packages.length === 0 ? (
          <p className="text-label-secondary text-[14px]">Nenhum pacote ativo.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {packages.map((p) => (
              <li key={p.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-[14px]">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-label-secondary text-[12px] tabular-nums">
                    {p.remaining} de {p.sessionsTotal} {p.recurring ? 'no mês' : 'restantes'}
                  </span>
                </div>
                <div className="bg-foreground/[0.07] h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-system-blue h-full rounded-full"
                    style={{ width: `${(p.remaining / p.sessionsTotal) * 100}%` }}
                  />
                </div>
                <span
                  className={
                    p.expired ? 'text-destructive text-[12px]' : 'text-label-secondary text-[12px]'
                  }
                >
                  {p.serviceName}
                  {p.periodEnd
                    ? p.recurring
                      ? ` · renova em ${dateFmt.format(new Date(p.periodEnd))}`
                      : p.expired
                        ? ` · venceu em ${dateFmt.format(new Date(p.periodEnd))}`
                        : ` · vale até ${dateFmt.format(new Date(p.periodEnd))}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <ReceiptIcon className="size-4 text-[#ff9500]" />
          Em aberto{' '}
          {owed > 0 && (
            <span className="text-[#b25f00] dark:text-[#ffb340]">· {formatCurrencyBRL(owed)}</span>
          )}
        </h2>
        {!tab || tab.length === 0 ? (
          <p className="text-label-secondary text-[14px]">Nada a receber deste cliente.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tab.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 text-[14px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate">{t.description}</span>
                    <span className="text-label-secondary text-[12px]">
                      {t.dueDate
                        ? `vence ${dateFmt.format(new Date(t.dueDate))}`
                        : `desde ${dateFmt.format(new Date(t.createdAt))}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">
                      {formatCurrencyBRL(t.amount)}
                    </span>
                    {receiving !== t.id && (
                      <Button size="sm" variant="outline" onClick={() => setReceiving(t.id)}>
                        Receber
                      </Button>
                    )}
                  </span>
                </div>
                {receiving === t.id && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {METHODS.map((m) => (
                      <Button
                        key={m.value}
                        size="sm"
                        variant="secondary"
                        disabled={receive.isPending}
                        onClick={() => receive.mutate({ transactionId: t.id, method: m.value })}
                      >
                        {m.label}
                      </Button>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => setReceiving(null)}>
                      Voltar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SaleDialog
        open={saleOpen}
        onOpenChange={(open) => {
          setSaleOpen(open);
          if (!open) queryClient.invalidateQueries({ queryKey: ['client-packages', clientId] });
        }}
        defaultClientId={clientId}
        defaultTab="pacote"
      />
    </div>
  );
}
