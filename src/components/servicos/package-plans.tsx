'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PackageIcon, PlusIcon, RepeatIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Surface } from '@/components/layout/page';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
      <PlanDrawer
        key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.id}
        open={editing !== null}
        recurring={subscription}
        plan={editing === null || editing === 'new' ? null : editing}
        services={services.filter((s) => s.active)}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          queryClient.invalidateQueries({ queryKey: ['package-plans'] });
          queryClient.invalidateQueries({ queryKey: ['services'] });
        }}
      />
    </section>
  );
}

type ServiceMode = 'existing' | 'combine' | 'new';

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)}h ${rest}min` : `${minutes / 60}h`;
}

/** Cadastro do pacote/assinatura no painel lateral, no mesmo padrão do cadastro de serviço. */
function PlanDrawer({
  open,
  recurring,
  plan,
  services,
  onClose,
  onSaved,
}: {
  open: boolean;
  recurring: boolean;
  plan: Plan | null;
  services: SerializedService[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(plan?.name ?? '');
  const [mode, setMode] = React.useState<ServiceMode>(services.length ? 'existing' : 'new');
  const [serviceId, setServiceId] = React.useState(plan?.serviceId ?? services[0]?.id ?? '');
  const [combineIds, setCombineIds] = React.useState<string[]>([]);
  // Serviço novo/somado: nome, duração e preço avulso; na soma, preenchidos sozinhos até editar.
  const [newName, setNewName] = React.useState<string | null>(null);
  const [newDuration, setNewDuration] = React.useState<string | null>(null);
  const [newPrice, setNewPrice] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState(String(plan?.sessions ?? 4));
  const [price, setPrice] = React.useState(plan ? String(plan.price).replace('.', ',') : '');
  const [validity, setValidity] = React.useState(
    plan?.validityDays ? String(plan.validityDays) : '',
  );

  const combined = combineIds
    .map((cid) => services.find((s) => s.id === cid))
    .filter((s): s is SerializedService => Boolean(s));
  const combinedPrice = Math.round(combined.reduce((t, s) => t + s.price, 0) * 100) / 100;
  const combinedMinutes = combined.reduce((t, s) => t + s.durationMinutes, 0);
  const serviceName =
    newName ?? (mode === 'combine' ? combined.map((s) => s.name).join(' + ') : '');
  const serviceMinutes =
    newDuration ?? (mode === 'combine' && combinedMinutes ? String(combinedMinutes) : '60');
  const serviceSinglePrice =
    newPrice ??
    (mode === 'combine' && combinedPrice ? String(combinedPrice).replace('.', ',') : '');

  const service = services.find((s) => s.id === serviceId);
  const singlePrice = mode === 'existing' ? (service?.price ?? 0) : parseMoney(serviceSinglePrice);
  const priceValue = parseMoney(price);
  const sessionsValue = Number(sessions) || 0;
  const fullPrice = singlePrice * sessionsValue;
  const saving =
    fullPrice > 0 && priceValue > 0 ? Math.round((1 - priceValue / fullPrice) * 100) : 0;

  const save = useMutation({
    mutationFn: () =>
      savePackagePlanAction({
        id: plan?.id ?? null,
        name,
        serviceId: mode === 'existing' ? serviceId : null,
        newService:
          mode === 'existing'
            ? null
            : {
                name: serviceName,
                durationMinutes: Number(serviceMinutes) || 0,
                price: parseMoney(serviceSinglePrice),
                combineIds: mode === 'combine' ? combineIds : [],
              },
        sessions: sessionsValue,
        price: priceValue,
        validityDays: !recurring && validity ? Number(validity) : null,
        recurring,
      }).then(unwrapResult),
    onSuccess: () => {
      const label = recurring ? 'Assinatura' : 'Pacote';
      const done = recurring ? (plan ? 'atualizada' : 'criada') : plan ? 'atualizado' : 'criado';
      toast.success(
        `${label} ${done}${plan ? ' (vale para as próximas vendas)' : ''}.` +
          (mode === 'existing' ? '' : ' O serviço também foi criado em Serviços → Pacotes.'),
      );
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleCombine(id: string) {
    setCombineIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  const canSave =
    Boolean(name.trim()) &&
    priceValue > 0 &&
    sessionsValue > 0 &&
    (mode === 'existing'
      ? Boolean(serviceId)
      : Boolean(serviceName.trim()) && (mode === 'new' || combined.length >= 2));

  return (
    <Drawer open={open} onOpenChange={(next: boolean) => !next && onClose()} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full! data-[vaul-drawer-direction=right]:sm:w-3/4!">
        <DrawerHeader>
          <DrawerTitle>
            {recurring
              ? plan
                ? 'Editar assinatura'
                : 'Nova assinatura'
              : plan
                ? 'Editar pacote'
                : 'Novo pacote'}
          </DrawerTitle>
          <DrawerDescription>
            {recurring
              ? 'Sessões por mês com mensalidade. Renova sozinha todo mês até ser cancelada.'
              : 'Sessões para usar quando quiser, pagas de uma vez.'}
          </DrawerDescription>
        </DrawerHeader>

        <form
          id="package-plan-form"
          className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) save.mutate();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-name">Nome</Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={recurring ? 'Ex.: Plano mensal' : 'Ex.: Pacote 10 sessões'}
              maxLength={120}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Serviço</Label>
            <SegmentedControl
              size="sm"
              className="self-start"
              value={mode}
              onValueChange={setMode}
              options={[
                ...(services.length ? [{ value: 'existing' as const, label: 'Escolher um' }] : []),
                ...(services.length >= 2
                  ? [{ value: 'combine' as const, label: 'Juntar serviços' }]
                  : []),
                { value: 'new' as const, label: 'Criar novo' },
              ]}
            />

            {mode === 'existing' && (
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolha o serviço" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {formatCurrencyBRL(s.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {mode === 'combine' && (
              <>
                <p className="text-muted-foreground text-[13px]">
                  Marque os serviços que entram em cada sessão. Eles viram um serviço só, com a
                  duração e o preço somados.
                </p>
                <div className="ring-foreground/[0.08] max-h-60 overflow-y-auto rounded-xl ring-1">
                  {services.map((s) => {
                    const checked = combineIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggleCombine(s.id)}
                        className={cn(
                          'border-foreground/[0.06] flex w-full items-center gap-3 border-b px-3 py-2.5 text-left text-sm transition-colors last:border-0',
                          checked ? 'bg-primary/[0.06]' : 'hover:bg-foreground/[0.03]',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded-md ring-1 transition-colors',
                            checked
                              ? 'bg-primary text-primary-foreground ring-primary'
                              : 'ring-foreground/20',
                          )}
                        >
                          {checked && <CheckIcon className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{s.name}</span>
                          <span className="text-muted-foreground text-[12px]">
                            {formatMinutes(s.durationMinutes)}
                          </span>
                        </span>
                        <span className="tabular-nums">{formatCurrencyBRL(s.price)}</span>
                      </button>
                    );
                  })}
                </div>
                {combined.length >= 2 && (
                  <p className="text-[13px]">
                    Somados: <strong>{formatCurrencyBRL(combinedPrice)}</strong> ·{' '}
                    {formatMinutes(combinedMinutes)} por sessão
                  </p>
                )}
              </>
            )}
          </div>

          {mode !== 'existing' && (
            <div className="bg-foreground/[0.03] flex flex-col gap-4 rounded-2xl p-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="plan-service-name">Nome do serviço</Label>
                <Input
                  id="plan-service-name"
                  value={serviceName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={
                    mode === 'combine' ? 'Marque os serviços acima' : 'Ex.: Sessão completa'
                  }
                  maxLength={200}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="plan-service-duration">Duração (min)</Label>
                  <Input
                    id="plan-service-duration"
                    type="number"
                    min={5}
                    step={5}
                    value={serviceMinutes}
                    onChange={(e) => setNewDuration(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="plan-service-price">Preço avulso (R$)</Label>
                  <Input
                    id="plan-service-price"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={serviceSinglePrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-[12px]">
                O serviço fica em Serviços, na categoria &ldquo;Pacotes&rdquo;, para a equipe
                agendar as sessões. Não aparece no agendamento online.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-sessions">Sessões{recurring ? ' por mês' : ''}</Label>
              <Input
                id="plan-sessions"
                type="number"
                min={1}
                max={100}
                value={sessions}
                onChange={(e) => setSessions(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-price">Preço {recurring ? 'por mês' : 'do pacote'} (R$)</Label>
              <Input
                id="plan-price"
                inputMode="decimal"
                placeholder="0,00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>

          {!recurring && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-validity">Validade em dias (opcional)</Label>
              <Input
                id="plan-validity"
                type="number"
                min={1}
                placeholder="Sem validade"
                value={validity}
                onChange={(e) => setValidity(e.target.value)}
              />
            </div>
          )}

          {fullPrice > 0 && (
            <div className="bg-foreground/[0.03] flex flex-col gap-1 rounded-2xl p-4 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {sessionsValue} {sessionsValue === 1 ? 'sessão avulsa' : 'sessões avulsas'}
                </span>
                <span className="tabular-nums">{formatCurrencyBRL(fullPrice)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>{recurring ? 'Na assinatura' : 'No pacote'}</span>
                <span className="tabular-nums">
                  {priceValue > 0 ? formatCurrencyBRL(priceValue) : '—'}
                </span>
              </div>
              {saving > 0 && (
                <p className="text-delta-good pt-1 font-medium">
                  O cliente economiza {saving}% ({formatCurrencyBRL(fullPrice - priceValue)}).
                </p>
              )}
            </div>
          )}
        </form>

        <DrawerFooter>
          <Button type="submit" form="package-plan-form" disabled={save.isPending || !canSave}>
            {save.isPending
              ? 'Salvando...'
              : plan
                ? 'Salvar alterações'
                : recurring
                  ? 'Criar assinatura'
                  : 'Criar pacote'}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
