'use client';

import Link from 'next/link';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDaysIcon, MapPinIcon, StarIcon, PencilIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { optimisticUpdate } from '@/lib/query-cache';
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
import { ClientCredits } from '@/components/clientes/client-credits';
import { getClientReferralsAction } from '@/server/actions/relationship-actions';
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
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ClientFormsTab } from '@/components/fichas/client-forms-tab';
import { ClientPackagesTab } from '@/components/pacotes/client-packages-tab';
import { ClientSessionsTab } from '@/components/pacotes/client-sessions-tab';

const TABS = [
  { value: 'resumo', label: 'Resumo' },
  { value: 'fichas', label: 'Fichas e formulários' },
  { value: 'pacotes', label: 'Pacotes e tratamentos' },
  { value: 'sessoes', label: 'Histórico das sessões' },
] as const;
type Tab = (typeof TABS)[number]['value'];

type ClientDetailData = NonNullable<Awaited<ReturnType<typeof getClientDetailAction>>>;

export function ClientDetail({
  clientId,
  initialData,
  timezone,
  initialTab,
}: {
  clientId: string;
  initialData: ClientDetailData;
  timezone: string;
  initialTab?: string;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<Tab>(
    TABS.some((t) => t.value === initialTab) ? (initialTab as Tab) : 'resumo',
  );
  function changeTab(next: Tab) {
    setTab(next);
    // A aba fica no endereço: voltar ou recarregar mantém onde a pessoa estava.
    const url = new URL(window.location.href);
    if (next === 'resumo') url.searchParams.delete('aba');
    else url.searchParams.set('aba', next);
    window.history.replaceState(null, '', url);
  }
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const { data } = useQuery({
    queryKey: ['client-detail', clientId],
    queryFn: () => getClientDetailAction(clientId),
    initialData,
  });

  // Estrela e "Ativo" mudam na tela na hora; se o servidor recusar, voltam ao que eram.
  const detailKey = ['client-detail', clientId];
  function patchClient(patch: { isVip?: boolean; active?: boolean }) {
    return optimisticUpdate<ClientDetailData>(queryClient, detailKey, (current) => ({
      ...current,
      client: { ...current.client, ...patch },
    }));
  }
  const settle = () => {
    queryClient.invalidateQueries({ queryKey: detailKey });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  const { data: referrals } = useQuery({
    queryKey: ['client-referrals', clientId],
    queryFn: () => getClientReferralsAction(clientId),
  });

  const toggleVip = useMutation({
    mutationFn: (isVip: boolean) => setClientVipAction({ id: clientId, isVip }).then(unwrapResult),
    onMutate: async (isVip) => ({ rollback: await patchClient({ isVip }) }),
    onError: (error: Error, _isVip, context) => {
      context?.rollback();
      toast.error(error.message || 'Não foi possível atualizar.');
    },
    onSettled: settle,
  });

  const toggleActive = useMutation({
    mutationFn: (active: boolean) =>
      setClientActiveAction({ id: clientId, active }).then(unwrapResult),
    onMutate: async (active) => ({ rollback: await patchClient({ active }) }),
    onError: (error: Error, _active, context) => {
      context?.rollback();
      toast.error(error.message || 'Não foi possível atualizar.');
    },
    onSettled: settle,
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
          <div className="flex items-center gap-2">
            <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em] md:text-[34px]">
              {client.name}
            </h1>
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
            {/* Relacionamento, não cadastro: quem nunca veio não é "inativo", e o interruptor ao
                lado já diz se o cadastro está ativo. */}
            {stats.lastVisitAt === null ? (
              <Badge variant="outline">Ainda não atendido</Badge>
            ) : (
              stats.isInactive && <Badge variant="outline">Sem visita há mais de 60 dias</Badge>
            )}
            {!client.active && <Badge variant="outline">Arquivado</Badge>}
          </div>
          <p className="text-muted-foreground text-sm">
            {client.phone ? formatPhone(client.phone) : '—'}{' '}
            {client.email ? `· ${client.email}` : ''}
          </p>
          {referrals && (referrals.referredBy || referrals.referrals.length > 0) && (
            <p className="text-muted-foreground mt-1 text-sm">
              {referrals.referredBy && (
                <>
                  Indicado por{' '}
                  <Link
                    href={`/clientes/${referrals.referredBy.id}`}
                    className="text-system-blue hover:underline"
                  >
                    {referrals.referredBy.name}
                  </Link>
                </>
              )}
              {referrals.referredBy && referrals.referrals.length > 0 && ' · '}
              {referrals.referrals.length > 0 &&
                `Indicou ${referrals.referrals.length} ${referrals.referrals.length === 1 ? 'cliente' : 'clientes'}: ${referrals.referrals
                  .slice(0, 3)
                  .map((r) => r.name.split(' ')[0])
                  .join(', ')}${referrals.referrals.length > 3 ? '…' : ''}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <div className="mr-1 flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Cadastro ativo</span>
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
          <Button variant="outline" asChild>
            <Link href={`/agenda?cliente=${client.id}`}>Agendar</Link>
          </Button>
          <Button variant="outline" onClick={() => setDrawerOpen(true)}>
            <PencilIcon className="size-4" />
            Editar
          </Button>
        </div>
      </div>

      <SegmentedControl
        className="self-start"
        value={tab}
        onValueChange={changeTab}
        options={TABS.map((t) => ({ value: t.value, label: t.label }))}
      />

      {tab === 'fichas' && (
        <ClientFormsTab clientId={clientId} clientName={client.name} timezone={timezone} />
      )}
      {tab === 'pacotes' && <ClientPackagesTab clientId={clientId} timezone={timezone} />}
      {tab === 'sessoes' && <ClientSessionsTab clientId={clientId} timezone={timezone} />}

      {tab === 'resumo' && (
        <>
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

          <ClientCredits clientId={clientId} />

          {data.nextReturn && (
            <NextReturn data={data.nextReturn} phone={client.phone} timezone={timezone} />
          )}

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
        </>
      )}

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

/** Retorno por serviço: quando este cliente deveria voltar, com a mensagem pronta. */
function NextReturn({
  data,
  phone,
  timezone,
}: {
  data: NonNullable<ClientDetailData['nextReturn']>;
  phone: string | null;
  timezone: string;
}) {
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(data.dueAt));
  const late = data.daysLate > 0;
  const link = whatsappLink(phone, data.message);

  return (
    <div className="bg-tile flex flex-wrap items-center gap-3 rounded-[22px] p-5 md:p-6">
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-xs">Retorno sugerido</div>
        <div className="text-[15px] font-semibold">
          {data.serviceName} · {date}
        </div>
        <div
          className={
            late
              ? 'text-[13px] text-[#b25f00] dark:text-[#ffb340]'
              : 'text-label-secondary text-[13px]'
          }
        >
          {late
            ? `Atrasado ${data.daysLate} ${data.daysLate === 1 ? 'dia' : 'dias'}`
            : data.daysLate === 0
              ? 'É hoje'
              : `Faltam ${-data.daysLate} ${data.daysLate === -1 ? 'dia' : 'dias'}`}{' '}
          · a cada {data.returnAfterDays} dias
        </div>
      </div>
      {link && (
        <Button variant="outline" asChild>
          <a href={link} target="_blank" rel="noreferrer">
            Chamar no WhatsApp
          </a>
        </Button>
      )}
    </div>
  );
}
