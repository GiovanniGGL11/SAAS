'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  CalendarPlusIcon,
  CheckSquareIcon,
  FileTextIcon,
  HistoryIcon,
  PackageIcon,
  SquareIcon,
  WalletIcon,
  WrenchIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { PACKAGE_ALERT_LABEL, FINANCIAL_STATUS_LABEL } from '@/lib/packages';
import { QUOTE_STATUS_LABEL } from '@/lib/quotes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckoutForm } from '@/components/agenda/checkout-form';
import { AppointmentForms } from '@/components/fichas/appointment-forms';
import {
  STATUS_BADGE_VARIANT,
  STATUS_COLORS,
  STATUS_LABELS,
  quickStatusActions,
} from '@/components/agenda/status';
import { updateAppointmentStatusAction } from '@/server/actions/agenda-actions';
import { listActiveProductsAction } from '@/server/actions/stock-actions';
import {
  getAppointmentOverviewAction,
  recordExtraMaterialAction,
  setChecklistItemAction,
} from '@/server/actions/appointment-overview-actions';
import type { AppointmentOverview } from '@/server/data/appointment-overview';
import type { AppointmentStatus } from '@/generated/prisma/client';

function formatDateTime(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatDate(iso: string, timezone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso));
}

function Card({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-tile flex flex-col gap-3 rounded-3xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Icon className="text-label-secondary size-4" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Visão do atendimento: o que a equipe precisa durante o atendimento, num lugar só. Reaproveita
 * fichas, registro da sessão, comanda, pacote e estoque — nenhuma regra nova de consumo: agendar
 * não consome sessão; concluir pela comanda consome uma vez.
 */
export function AppointmentOverviewView({
  appointmentId,
  initialData,
  timezone,
}: {
  appointmentId: string;
  initialData: AppointmentOverview;
  timezone: string;
}) {
  const queryClient = useQueryClient();
  const key = ['appointment-overview', appointmentId];
  const { data = initialData } = useQuery({
    queryKey: key,
    queryFn: () => getAppointmentOverviewAction(appointmentId).then(unwrapResult),
    initialData,
  });
  const [showCheckout, setShowCheckout] = React.useState(false);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['appointments'] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: Exclude<AppointmentStatus, 'CANCELED'>) =>
      updateAppointmentStatusAction({ id: appointmentId, status }).then(unwrapResult),
    onSuccess: () => toast.success('Status atualizado.'),
    onError: (error: Error) =>
      toast.error(error.message || 'Não foi possível atualizar o status.', { duration: 9000 }),
    onSettled: refresh,
  });

  const canceled = data.status === 'CANCELED';
  // Dia do atendimento no fuso da empresa (AAAA-MM-DD), para voltar à agenda nesse dia.
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(
    new Date(data.startAt),
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-10">
      <div className="flex flex-col gap-2">
        <Link
          href={`/agenda?data=${day}&agendamento=${data.id}`}
          className="text-system-blue flex items-center gap-1 text-[13px] font-medium hover:underline"
        >
          <ArrowLeftIcon className="size-3.5" /> Agenda
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
            <Link href={`/clientes/${data.client.id}`} className="hover:underline">
              {data.client.name}
            </Link>
          </h1>
          <Badge variant={STATUS_BADGE_VARIANT[data.status]}>{STATUS_LABELS[data.status]}</Badge>
          {data.client.isVip && <Badge variant="outline">VIP</Badge>}
        </div>
        <p className="text-label-secondary text-[14px]">
          {formatDateTime(data.startAt, timezone)} · {data.serviceName} · {data.professional.name}
          {data.price > 0 && ` · ${formatCurrencyBRL(data.price)}`}
        </p>
        {data.notes && (
          <p className="bg-foreground/[0.04] rounded-xl px-3 py-2 text-[13px]">{data.notes}</p>
        )}
        {canceled && data.cancellationReason && (
          <p className="text-system-red text-[13px]">Cancelado: {data.cancellationReason}</p>
        )}
      </div>

      {!canceled && (
        <div className="flex flex-col gap-3">
          {showCheckout ? (
            <CheckoutForm
              appointmentId={data.id}
              price={data.price}
              plannedPackageId={data.plannedPackageId}
              onDone={() => {
                setShowCheckout(false);
                refresh();
              }}
              onCancel={() => setShowCheckout(false)}
            />
          ) : (
            quickStatusActions(data.status).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quickStatusActions(data.status).map((action) => (
                  <Button
                    key={action.status}
                    variant={action.primary ? 'default' : 'outline'}
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      action.status === 'DONE'
                        ? setShowCheckout(true)
                        : statusMutation.mutate(action.status)
                    }
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{
                        backgroundColor: action.primary
                          ? 'currentColor'
                          : STATUS_COLORS[action.status],
                      }}
                      aria-hidden
                    />
                    {action.label}
                  </Button>
                ))}
              </div>
            )
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data.package && (
          <Card icon={PackageIcon} title="Pacote">
            <div className="flex flex-col gap-1 text-[14px]">
              <div className="font-medium">{data.package.name}</div>
              <div className="text-label-secondary text-[13px]">
                {data.package.done} de {data.package.total} sessões realizadas ·{' '}
                {data.package.remaining} restante{data.package.remaining === 1 ? '' : 's'}
                {data.package.validUntil &&
                  ` · válido até ${formatDate(data.package.validUntil, timezone)}`}
              </div>
              {data.package.sessionNumber ? (
                <div className="text-system-green text-[13px]">
                  Esta foi a sessão {data.package.sessionNumber}.
                </div>
              ) : (
                <div className="text-label-secondary text-[12px]">
                  Agendar não usa a sessão: a baixa acontece uma vez, ao concluir pela comanda.
                </div>
              )}
              {data.package.alerts.map((alert) => (
                <div key={alert} className="text-[12px] text-amber-800 dark:text-amber-300">
                  {PACKAGE_ALERT_LABEL[alert]}
                </div>
              ))}
              {data.package.financial && (
                <div className="text-label-secondary text-[12px]">
                  Pagamento: {FINANCIAL_STATUS_LABEL[data.package.financial.status]}
                  {data.package.financial.unbilled > 0 &&
                    ` · ${formatCurrencyBRL(data.package.financial.unbilled)} a lançar`}
                </div>
              )}
              <Link
                href={`/clientes/${data.client.id}?aba=pacotes`}
                className="text-system-blue text-[13px] hover:underline"
              >
                Abrir pacote
              </Link>
            </div>
          </Card>
        )}

        <Card icon={FileTextIcon} title="Fichas e evolução">
          <AppointmentForms
            appointmentId={data.id}
            clientId={data.client.id}
            clientName={data.client.name}
            canceled={canceled}
            timezone={timezone}
          />
          <p className="text-label-secondary text-[12px]">
            Evolução e assinatura ficam em “Registro da sessão”.
          </p>
        </Card>

        {data.checklist && data.checklist.items.length > 0 && (
          <ChecklistCard
            appointmentId={data.id}
            items={data.checklist.items}
            checked={data.checklist.checked}
            disabled={canceled}
            onChanged={refresh}
          />
        )}

        <MaterialsCard data={data} canceled={canceled} onChanged={refresh} />

        <Card icon={HistoryIcon} title="Atendimento anterior">
          {data.clinical ? (
            data.clinical.previous ? (
              <div className="flex flex-col gap-1 text-[14px]">
                <div>
                  {formatDate(data.clinical.previous.startAt, timezone)} ·{' '}
                  {data.clinical.previous.serviceName}
                </div>
                <div className="text-label-secondary text-[13px]">
                  com {data.clinical.previous.professionalName}
                  {data.clinical.previous.recordStatus
                    ? ' · com registro da sessão'
                    : ' · sem registro da sessão'}
                </div>
                <Link
                  href={`/clientes/${data.client.id}?aba=sessoes`}
                  className="text-system-blue text-[13px] hover:underline"
                >
                  Ver histórico de sessões
                </Link>
              </div>
            ) : (
              <p className="text-label-secondary text-[13px]">Primeiro atendimento concluído.</p>
            )
          ) : (
            <p className="text-label-secondary text-[13px]">
              O histórico clínico aparece para quem tem permissão de ler fichas.
            </p>
          )}
        </Card>

        {data.financial && (
          <Card icon={WalletIcon} title="Pendências financeiras">
            {data.financial.openTabCount > 0 ? (
              <div className="flex flex-col gap-1 text-[14px]">
                <div>
                  {formatCurrencyBRL(data.financial.openTabAmount)} em aberto (
                  {data.financial.openTabCount} lançamento
                  {data.financial.openTabCount === 1 ? '' : 's'})
                </div>
                <Link
                  href={`/clientes/${data.client.id}`}
                  className="text-system-blue text-[13px] hover:underline"
                >
                  Ver no cliente
                </Link>
              </div>
            ) : (
              <p className="text-label-secondary text-[13px]">Nada em aberto.</p>
            )}
          </Card>
        )}

        <Card icon={CalendarPlusIcon} title="Próximos passos">
          <div className="flex flex-col gap-2 text-[14px]">
            {data.next ? (
              <div>
                Próximo agendamento: {formatDateTime(data.next.startAt, timezone)} ·{' '}
                {data.next.serviceName}
              </div>
            ) : (
              <Button variant="outline" className="self-start" asChild>
                <Link
                  href={`/agenda?cliente=${data.client.id}${
                    data.package ? `&pacote=${data.package.id}` : ''
                  }`}
                >
                  <CalendarPlusIcon className="size-4" /> Agendar próximo
                </Link>
              </Button>
            )}
            {data.quotes.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-label-secondary text-[12px]">Orçamentos em aberto</span>
                {data.quotes.map((q) => (
                  <Link
                    key={q.id}
                    href={`/clientes/orcamentos?id=${q.id}`}
                    className="text-system-blue text-[13px] hover:underline"
                  >
                    #{q.number} {q.title} — {QUOTE_STATUS_LABEL[q.status]}
                  </Link>
                ))}
              </div>
            )}
            <Link
              href={`/clientes/orcamentos?novo=${data.client.id}`}
              className="text-system-blue text-[13px] hover:underline"
            >
              Novo orçamento para {data.client.name.split(/\s+/)[0]}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ChecklistCard({
  appointmentId,
  items,
  checked,
  disabled,
  onChanged,
}: {
  appointmentId: string;
  items: string[];
  checked: string[];
  disabled: boolean;
  onChanged: () => void;
}) {
  const toggle = useMutation({
    mutationFn: (input: { item: string; checked: boolean }) =>
      setChecklistItemAction({ appointmentId, ...input }).then(unwrapResult),
    onError: (error: Error) => toast.error(error.message || 'Não foi possível salvar.'),
    onSettled: onChanged,
  });
  const done = checked.length;
  return (
    <Card
      icon={CheckSquareIcon}
      title="Checklist"
      action={
        <span className="text-label-secondary text-[12px] tabular-nums">
          {done}/{items.length}
        </span>
      }
    >
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const isChecked = checked.includes(item);
          return (
            <li key={item}>
              <button
                type="button"
                disabled={disabled || toggle.isPending}
                onClick={() => toggle.mutate({ item, checked: !isChecked })}
                className="hover:bg-foreground/[0.04] flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[14px]"
                aria-pressed={isChecked}
              >
                {isChecked ? (
                  <CheckSquareIcon className="text-system-green size-4 shrink-0" />
                ) : (
                  <SquareIcon className="text-label-secondary size-4 shrink-0" />
                )}
                <span className={isChecked ? 'text-label-secondary line-through' : ''}>{item}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function MaterialsCard({
  data,
  canceled,
  onChanged,
}: {
  data: AppointmentOverview;
  canceled: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [productId, setProductId] = React.useState('');
  const [quantity, setQuantity] = React.useState('1');
  const { data: products = [] } = useQuery({
    queryKey: ['products-active'],
    queryFn: () => listActiveProductsAction(),
    enabled: adding,
  });
  const add = useMutation({
    mutationFn: () =>
      recordExtraMaterialAction({
        appointmentId: data.id,
        productId,
        quantity: Number(quantity),
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Material registrado e baixado do estoque.');
      setAdding(false);
      setProductId('');
      setQuantity('1');
    },
    onError: (error: Error) => toast.error(error.message || 'Não foi possível registrar.'),
    onSettled: onChanged,
  });
  const { planned, movements } = data.supplies;
  if (planned.length === 0 && movements.length === 0 && canceled) return null;
  return (
    <Card icon={WrenchIcon} title="Materiais">
      {planned.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-label-secondary text-[12px]">
            Previstos pelo serviço (saem do estoque ao concluir)
          </span>
          {planned.map((p) => (
            <div key={p.productId} className="flex justify-between gap-2 text-[14px]">
              <span>{p.name}</span>
              <span
                className={p.stock < p.quantity ? 'text-system-red tabular-nums' : 'tabular-nums'}
              >
                {p.quantity} · em estoque {p.stock}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-label-secondary text-[13px]">O serviço não tem materiais cadastrados.</p>
      )}
      {movements.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-label-secondary text-[12px]">Movimentado neste atendimento</span>
          {movements.map((m) => (
            <div key={m.id} className="flex justify-between gap-2 text-[13px]">
              <span>
                {m.name} <span className="text-label-secondary">· {m.reason}</span>
              </span>
              <span className="tabular-nums">
                {m.type === 'IN' ? '+' : '−'}
                {m.quantity}
              </span>
            </div>
          ))}
        </div>
      )}
      {!canceled &&
        (adding ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="min-w-0 flex-1" aria-label="Material usado">
                <SelectValue placeholder="Material usado" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.quantity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              className="w-20"
              aria-label="Quantidade"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={!productId || add.isPending}>
              Registrar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setAdding(true)}
          >
            Registrar material usado a mais
          </Button>
        ))}
    </Card>
  );
}
