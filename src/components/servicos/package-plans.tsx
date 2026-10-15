'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageIcon, PlusIcon } from 'lucide-react';
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

/** Pacotes ("10 cortes por R$ 400") e assinaturas ("4 cortes por mês"): o admin cria, a recepção vende. */
export function PackagePlans({
  services,
  isAdmin,
}: {
  services: SerializedService[];
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<Plan | 'new' | null>(null);
  const { data } = useQuery({
    queryKey: ['package-plans'],
    queryFn: () => listPackagePlansAction(),
  });
  const toggle = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      setPackagePlanActiveAction(input).then(unwrapResult),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['package-plans'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">Pacotes e assinaturas</h2>
          <p className="text-label-secondary text-[14px]">
            Vendidos no Caixa ou na ficha do cliente; cada sessão é usada na hora de cobrar o
            atendimento.
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => setEditing('new')}>
            <PlusIcon className="size-4" />
            Novo plano
          </Button>
        )}
      </div>
      <Surface>
        {!data || data.length === 0 ? (
          <div className="text-label-secondary flex items-center gap-3 p-5 text-[14px]">
            <PackageIcon className="size-5" />
            Nenhum plano ainda. Ex.: &ldquo;4 cortes por R$ 160&rdquo; ou &ldquo;Clube: 4 cortes por
            mês por R$ 150&rdquo;.
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
                  <div className="flex items-center gap-2 font-medium">
                    {p.name}
                    {p.recurring && (
                      <span className="bg-system-blue/12 text-system-blue rounded-full px-2 py-0.5 text-[11px] font-semibold">
                        Assinatura
                      </span>
                    )}
                  </div>
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
  plan,
  services,
  onClose,
  onSaved,
}: {
  plan: Plan | null;
  services: SerializedService[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [recurring, setRecurring] = React.useState(plan?.recurring ?? false);
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
      toast.success(plan ? 'Plano atualizado (vale para as próximas vendas).' : 'Plano criado.');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plan ? 'Editar plano' : 'Novo plano'}</DialogTitle>
          <DialogDescription>
            Pacote: sessões para usar quando quiser. Assinatura: sessões por mês, renova sozinha.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="bg-foreground/[0.06] flex rounded-full p-0.5 text-[13px]">
            {[
              [false, 'Pacote'],
              [true, 'Assinatura mensal'],
            ].map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setRecurring(value as boolean)}
                className={cn(
                  'flex-1 rounded-full py-1.5 font-medium',
                  recurring === value && 'bg-background shadow-sm',
                )}
              >
                {label as string}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">Nome</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={recurring ? 'Clube do corte' : '4 cortes'}
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
