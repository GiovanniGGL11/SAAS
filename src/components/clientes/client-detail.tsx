'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StarIcon, PencilIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ClientDrawer } from '@/components/clientes/client-drawer';
import {
  getClientDetailAction,
  setClientActiveAction,
  setClientVipAction,
} from '@/server/actions/client-actions';
import { STATUS_LABELS } from '@/components/agenda/status';
import { formatCurrencyBRL } from '@/lib/serialize';
import { formatTimeInTz } from '@/lib/time';

type ClientDetailData = NonNullable<Awaited<ReturnType<typeof getClientDetailAction>>>;

export function ClientDetail({
  clientId,
  initialData,
  timezone,
}: {
  clientId: string;
  initialData: ClientDetailData;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const { data } = useQuery({
    queryKey: ['client-detail', clientId],
    queryFn: () => getClientDetailAction(clientId),
    initialData,
  });

  const toggleVip = useMutation({
    mutationFn: (isVip: boolean) => setClientVipAction({ id: clientId, isVip }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-detail', clientId] }),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar.'),
  });

  const toggleActive = useMutation({
    mutationFn: (active: boolean) => setClientActiveAction({ id: clientId, active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-detail', clientId] }),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar.'),
  });

  if (!data) {
    return <p className="text-muted-foreground">Cliente não encontrado.</p>;
  }

  const { client, stats, history } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            <button
              type="button"
              onClick={() => toggleVip.mutate(!client.isVip)}
              aria-label={client.isVip ? 'Remover VIP' : 'Marcar como VIP'}
            >
              <StarIcon
                className={
                  client.isVip
                    ? 'size-5 fill-amber-400 text-amber-400'
                    : 'text-muted-foreground size-5'
                }
              />
            </button>
            {stats.isInactive && <Badge variant="outline">Inativo</Badge>}
            {!client.active && <Badge variant="outline">Arquivado</Badge>}
          </div>
          <p className="text-muted-foreground text-sm">
            {client.phone || '—'} {client.email ? `· ${client.email}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Ativo</span>
            <Switch
              checked={client.active}
              onCheckedChange={(v: boolean) => toggleActive.mutate(v)}
            />
          </div>
          <Button variant="outline" onClick={() => setDrawerOpen(true)}>
            <PencilIcon className="size-4" />
            Editar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total gasto" value={formatCurrencyBRL(stats.totalSpent)} />
        <StatCard label="Ticket médio" value={formatCurrencyBRL(stats.averageTicket)} />
        <StatCard label="Atendimentos" value={String(stats.appointmentCount)} />
        <StatCard
          label="Última visita"
          value={
            stats.lastVisitAt
              ? new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(
                  new Date(stats.lastVisitAt),
                )
              : '—'
          }
        />
      </div>

      {client.cpf || client.birthDate || client.notes ? (
        <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm sm:grid-cols-3">
          {client.cpf && (
            <div>
              <div className="text-muted-foreground text-xs">CPF</div>
              <div>{client.cpf}</div>
            </div>
          )}
          {client.birthDate && (
            <div>
              <div className="text-muted-foreground text-xs">Nascimento</div>
              <div>
                {new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(
                  new Date(client.birthDate),
                )}
              </div>
            </div>
          )}
          {client.notes && (
            <div className="col-span-2 sm:col-span-3">
              <div className="text-muted-foreground text-xs">Observações</div>
              <div>{client.notes}</div>
            </div>
          )}
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-medium">Histórico de agendamentos</h2>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Profissional</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    Nenhum agendamento ainda.
                  </TableCell>
                </TableRow>
              )}
              {history.map((appointment) => (
                <TableRow key={appointment.id}>
                  <TableCell className="text-muted-foreground">
                    {new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(
                      appointment.startAt,
                    )}{' '}
                    {formatTimeInTz(appointment.startAt, timezone)}
                  </TableCell>
                  <TableCell>{appointment.serviceNameSnapshot}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {appointment.professional.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{STATUS_LABELS[appointment.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatCurrencyBRL(appointment.priceSnapshot)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <ClientDrawer open={drawerOpen} onOpenChange={setDrawerOpen} client={client} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
