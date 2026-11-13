'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2Icon, GlobeIcon, ReceiptIcon, UserXIcon } from 'lucide-react';
import { toast } from 'sonner';

import { formatCurrencyBRL } from '@/lib/serialize';
import { formatPhone } from '@/lib/phone';
import { unwrapResult } from '@/lib/action-result';
import { PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { updateAppointmentStatusAction } from '@/server/actions/agenda-actions';
import type { listAppointmentsToClose } from '@/server/data/to-close';

type Item = Awaited<ReturnType<typeof listAppointmentsToClose>>[number];

/**
 * Atendimentos que já passaram e ficaram em aberto. "Fechar" abre o atendimento com a comanda
 * (forma de pagamento) — é isso que conta a visita no cadastro do cliente. "Faltou" marca falta.
 */
export function ToCloseView({ items, timezone }: { items: Item[]; timezone: string }) {
  const router = useRouter();
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const when = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const noShow = useMutation({
    mutationFn: (id: string) =>
      updateAppointmentStatusAction({ id, status: 'NO_SHOW' }).then(unwrapResult),
    onSuccess: (_, id) => {
      setHidden((h) => new Set(h).add(id));
      toast.success('Marcado como falta.');
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = items.filter((i) => !hidden.has(i.id));

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader
        title="Atendimentos para fechar"
        description="O horário já passou e o atendimento continua em aberto. Feche os que aconteceram (conta como visita do cliente e registra o pagamento) e marque falta em quem não veio."
      />
      {visible.length === 0 ? (
        <section className="bg-tile flex flex-col items-center gap-2 rounded-[22px] p-10 text-center">
          <CheckCircle2Icon className="text-system-green size-10" />
          <p className="text-[17px] font-semibold">Tudo fechado.</p>
          <p className="text-label-secondary text-[14px]">
            Nenhum atendimento que já passou está em aberto.
          </p>
        </section>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => (
            <li
              key={item.id}
              className="bg-tile flex flex-col gap-3 rounded-[20px] p-4 md:flex-row md:items-center md:gap-4"
            >
              <span
                className="hidden h-10 w-1 shrink-0 rounded-full md:block"
                style={{ backgroundColor: item.professional.color }}
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold">{item.client.name}</span>
                  {item.online && (
                    <span className="bg-system-blue/10 text-system-blue inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                      <GlobeIcon className="size-3" /> Pelo link
                    </span>
                  )}
                </div>
                <span className="text-label-secondary text-[13px]">
                  {when.format(new Date(item.startAt))} · {item.serviceName} com{' '}
                  {item.professional.name} · {formatCurrencyBRL(item.price)}
                  {item.client.phone ? ` · ${formatPhone(item.client.phone)}` : ''}
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" asChild>
                  <Link href={`/agenda/atendimento/${item.id}`}>
                    <ReceiptIcon /> Fechar
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={noShow.isPending && noShow.variables === item.id}
                  onClick={() => noShow.mutate(item.id)}
                >
                  <UserXIcon /> Faltou
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
