'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageIcon, PlusIcon, RepeatIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Surface } from '@/components/layout/page';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL, type SerializedService } from '@/lib/serialize';
import { cn } from '@/lib/utils';
import {
  listPackagePlansAction,
  savePackagePlanAction,
  setPackagePlanActiveAction,
} from '@/server/actions/sales-actions';

type Plan = Awaited<ReturnType<typeof listPackagePlansAction>>[number];

function parseMoney(value: string): number {
  const n = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

type Kind = 'package' | 'subscription';

const COPY: Record<
  Kind,
  { title: string; text: string; create: string; empty: React.ReactNode; Icon: typeof PackageIcon }
> = {
  package: {
    title: 'Pacotes',
    text: 'Várias sessões vendidas de uma vez, para usar quando quiser (com ou sem validade). Vendidos no Caixa ou na ficha do cliente; cada sessão é usada na hora de cobrar o atendimento.',
    create: 'Novo pacote',
    empty: (
      <>
        Nenhum pacote ainda. Ex.: &ldquo;Pacote de 10 sessões&rdquo;, &ldquo;5 aulas&rdquo; ou
        &ldquo;4 atendimentos com desconto&rdquo; — pagos de uma vez, usados aos poucos.
      </>
    ),
    Icon: PackageIcon,
  },
  subscription: {
    title: 'Assinaturas',
    text: 'Serviço recorrente: o cliente paga por mês e tem um número de sessões por mês. Todo mês a assinatura renova sozinha, as sessões voltam a zero e a mensalidade fica a receber no fiado do cliente. Vendidas no Caixa ou na ficha do cliente.',
    create: 'Nova assinatura',
    empty: (
      <>
        Nenhuma assinatura ainda. Ex.: &ldquo;Plano mensal: 4 sessões por mês&rdquo;,
        &ldquo;Mensalidade: 8 aulas por mês&rdquo; ou &ldquo;Clube: 2 atendimentos por mês&rdquo; —
        o cliente paga todo mês e usa as sessões do mês.
      </>
    ),
    Icon: RepeatIcon,
  },
};

/** Pacotes ("10 sessões por R$ 400") ou assinaturas ("4 sessões por mês"): o admin cria, a recepção vende. */
export function PackagePlans({
  kind,
  services,
  isAdmin,
}: {
  kind: Kind;
  services: SerializedService[];
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<Plan | 'new' | null>(null);
  const subscription = kind === 'subscription';
  const copy = COPY[kind];
  const { data: all } = useQuery({
    queryKey: ['package-plans'],
    queryFn: () => listPackagePlansAction(),
  });
  const data = all?.filter((p) => p.recurring === subscription);
  const toggle = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setPackagePlanActiveAction(input).then(unwrapResult),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['package-plans'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-label-secondary max-w-2xl text-[14px]">{copy.text}</p>
        {isAdmin && (
          <Button onClick={() => setEditing('new')}>
            <PlusIcon className="size-4" />
            {copy.create}
          </Button>
        )}
      </div>
      <Surface>
        {!data || data.length === 0 ? (
          <div className="text-label-secondary flex items-center gap-3 p-5 text-[14px]">
            <copy.Icon className="size-5 shrink-0" />
            <span>{copy.empty}</span>
          </div>
        ) : (
          <ul className="divide-foreground/[0.06] divide-y">
            {data.map((p) => (
              <li
                key={p.id}
                className={cn('flex items-center gap-4 px-5 py-3.5', !p.active && 'opacity-55')}
              >
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => setEditing(p)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-label-secondary text-[13px]">
                    {p.sessions}× {p.serviceName}
                    {p.recurring
                      ? ' por mês'
                      : p.validityDays
                        ? ` · validade ${p.validityDays} dias`
                        : ''}{' '}
                    · {p.activeClients}{' '}
                    {p.activeClients === 1 ? 'cliente ativo' : 'clientes ativos'}
                  </div>
                </button>
                <span className="font-semibold tabular-nums">
                  {formatCurrencyBRL(p.price)}
                  {p.recurring ? '/mês' : ''}
                </span>
                {isAdmin && (
                  <Switch
                    checked={p.active}
                    aria-label={p.active ? 'Desativar plano' : 'Ativar plano'}
                    onCheckedChange={(active: boolean) => toggle.mutate({ id: p.id, active })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Surface>
      {editing !== null && (
        <PlanDialog
          recurring={subscription}
          plan={editing === 'new' ? null : editing}
          services={services.filter((s) => s.active)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['package-plans'] });
          }}
        />
      )}
    </section>
  );
}

function PlanDialog({
  recurring,
  plan,
  services,
  onClose,
  onSaved,
}: {
  recurring: boolean;
  plan: Plan | null;
  services: SerializedService[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(plan?.name ?? '');
  const [serviceId, setServiceId] = React.useState(plan?.serviceId ?? services[0]?.id ?? '');
  const [sessions, setSessions] = React.useState(String(plan?.sessions ?? 4));
  const [price, setPrice] = React.useState(plan ? String(plan.price).replace('.', ',') : '');
  const [validity, setValidity] = React.useState(
    plan?.validityDays ? String(plan.validityDays) : '',
  );
  const service = services.find((s) => s.id === serviceId);
  const priceValue = parseMoney(price);
  const sessionsValue = Number(sessions) || 0;
  const fullPrice = (service?.price ?? 0) * sessionsValue;
  const saving =
    fullPrice > 0 && priceValue > 0 ? Math.round((1 - priceValue / fullPrice) * 100) : 0;

  const save = useMutation({
    mutationFn: () =>
      savePackagePlanAction({
        id: plan?.id ?? null,
        name,
        serviceId,
        sessions: sessionsValue,
        price: priceValue,
        validityDays: !recurring && validity ? Number(validity) : null,
        recurring,
      }).then(unwrapResult),
    onSuccess: () => {
      const noun = recurring ? 'Assinatura' : 'Pacote';
      toast.success(
        plan
          ? `${noun} atualizad${recurring ? 'a' : 'o'} (vale para as próximas vendas).`
          : `${noun} criad${recurring ? 'a' : 'o'}.`,
      );
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {recurring
              ? plan
                ? 'Editar assinatura'
                : 'Nova assinatura'
              : plan
                ? 'Editar pacote'
                : 'Novo pacote'}
          </DialogTitle>
          <DialogDescription>
            {recurring
              ? 'Sessões por mês com mensalidade. Renova sozinha todo mês até ser cancelada.'
              : 'Sessões para usar quando quiser, pagas de uma vez.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Nome</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={recurring ? 'Ex.: Plano mensal' : 'Ex.: Pacote 10 sessões'}
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Serviço</span>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="bg-background ring-foreground/[0.08] h-10 rounded-xl px-3 ring-1"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {formatCurrencyBRL(s.price)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Sessões{recurring ? ' por mês' : ''}</span>
              <Input
                type="number"
                min={1}
                max={100}
                value={sessions}
                onChange={(e) => setSessions(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Preço{recurring ? ' por mês' : ''} (R$)</span>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
          </div>
          {!recurring && (
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Validade em dias (opcional)</span>
              <Input
                type="number"
                min={1}
                placeholder="Sem validade"
                value={validity}
                onChange={(e) => setValidity(e.target.value)}
              />
            </label>
          )}
          {saving > 0 && (
            <p className="text-delta-good text-[13px]">
              O cliente economiza {saving}% em relação a {sessionsValue} sessões avulsas (
              {formatCurrencyBRL(fullPrice)}).
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Voltar
            </Button>
            <Button type="submit" disabled={save.isPending || !serviceId}>
              Salvar plano
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
