'use client';

import Link from 'next/link';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDaysIcon, MapPinIcon, StarIcon, PencilIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { Button } from '@/components/ui/button';
import { formatPhone, whatsappLink } from '@/lib/phone';
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
import { EmptyState } from '@/components/ui/empty-state';
import { ClientDrawer } from '@/components/clientes/client-drawer';
import { ClientLoyalty } from '@/components/clientes/client-loyalty';
import { ClientPortalLinkButton } from '@/components/clientes/client-portal-link';
import { MobileList, MobileListItem } from '@/components/layout/mobile-list';
import {
  getClientDetailAction,
  setClientActiveAction,
  setClientVipAction,
} from '@/server/actions/client-actions';
import { STATUS_LABELS } from '@/components/agenda/status';
import { formatCurrencyBRL } from '@/lib/serialize';
import { formatTimeInTz } from '@/lib/time';
import { formatAddress, mapsSearchLink } from '@/lib/address';

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
    mutationFn: (isVip: boolean) => setClientVipAction({ id: clientId, isVip }).then(unwrapResult),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-detail', clientId] }),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar.'),
  });

  const toggleActive = useMutation({
    mutationFn: (active: boolean) =>
      setClientActiveAction({ id: clientId, active }).then(unwrapResult),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-detail', clientId] }),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível atualizar.'),
  });

  if (!data) {
    return <p className="text-muted-foreground">Cliente não encontrado.</p>;
  }

  const { client, stats, history } = data;
  const address = formatAddress(client);
  const mapsLink = mapsSearchLink(client);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="min-w-0 text-[28px] leading-tight font-bold tracking-[-0.03em] break-words md:text-[34px]">
              {client.name}
            </h1>
            <button
              type="button"
              onClick={() => toggleVip.mutate(!client.isVip)}
              aria-label={client.isVip ? 'Remover VIP' : 'Marcar como VIP'}
              className="-m-1.5 p-1.5"
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
          <p className="text-muted-foreground text-sm break-words">
            {client.phone ? formatPhone(client.phone) : '—'}{' '}
            {client.email ? `· ${client.email}` : ''}
          </p>
        </div>
        {/* No celular os botões descem para uma linha própria e quebram em vez de empurrar a tela. */}
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <div className="bg-foreground/[0.06] flex h-10 items-center gap-2 rounded-full pr-2 pl-3.5 md:h-9">
            <span className="text-muted-foreground text-xs">Ativo</span>
            <Switch
              checked={client.active}
              onCheckedChange={(v: boolean) => toggleActive.mutate(v)}
            />
          </div>
          {whatsappLink(client.phone) && (
            <Button variant="outline" asChild>
              <a href={whatsappLink(client.phone)!} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            </Button>
          )}
          <ClientPortalLinkButton clientId={client.id} clientName={client.name} />
          <Button variant="outline" onClick={() => setDrawerOpen(true)}>
            <PencilIcon className="size-4" />
            Editar
          </Button>
          <Button asChild>
            <Link href={`/agenda?cliente=${client.id}`}>
              <CalendarDaysIcon className="size-4" />
              Agendar
            </Link>
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

      <ClientLoyalty clientId={clientId} clientName={client.name} timezone={timezone} />

      {client.cpf || client.birthDate || client.notes || address ? (
        <div className="bg-tile grid grid-cols-2 gap-4 rounded-[22px] p-5 text-sm sm:grid-cols-3 md:p-6">
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
                {/* A data de nascimento é gravada como meia-noite UTC; no fuso de São Paulo ela
                    aparecia um dia antes. */}
                {new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
                  new Date(client.birthDate),
                )}
              </div>
            </div>
          )}
          {address && (
            <div className="col-span-2 sm:col-span-3">
              <div className="text-muted-foreground text-xs">Endereço</div>
              <div className="break-words">{address}</div>
              {mapsLink && (
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-system-blue mt-1 inline-flex items-center gap-1 text-[13px] hover:underline"
                >
                  <MapPinIcon className="size-3.5" />
                  Abrir no mapa
                </a>
              )}
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
        <div className="bg-tile overflow-hidden rounded-[22px]">
          {history.length > 0 && (
            <MobileList>
              {history.map((appointment) => (
                <MobileListItem
                  key={appointment.id}
                  title={<span className="truncate">{appointment.serviceNameSnapshot}</span>}
                  subtitle={`${new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(
                    appointment.startAt,
                  )} ${formatTimeInTz(appointment.startAt, timezone)} · ${appointment.professional.name}`}
                  trailing={
                    <div className="text-right">
                      <div className="text-[15px] tabular-nums">
                        {formatCurrencyBRL(appointment.priceSnapshot)}
                      </div>
                      <div className="text-label-secondary text-[12px]">
                        {STATUS_LABELS[appointment.status]}
                      </div>
                    </div>
                  }
                />
              ))}
            </MobileList>
          )}
          <Table className={history.length > 0 ? 'hidden md:table' : undefined}>
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
                  <TableCell colSpan={5}>
                    <EmptyState
                      icon={CalendarDaysIcon}
                      title="Nenhum agendamento ainda"
                      description="O histórico de atendimentos desse cliente aparece aqui."
                    />
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
    <div className="bg-tile rounded-[22px] p-5 md:p-6">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
