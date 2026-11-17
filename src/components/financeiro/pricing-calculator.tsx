'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  BookmarkPlusIcon,
  CheckIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Surface } from '@/components/layout/page';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { unitShort } from '@/lib/stock-units';
import { cn } from '@/lib/utils';
import {
  PRICING_PROBLEM_TEXT,
  calculatePricing,
  calculateResale,
  outcomeAt,
  resaleOutcome,
  supplyCost,
  type PricingInputs,
  type ResaleInputs,
} from '@/lib/pricing';
import type { UpgradeOffer } from '@/lib/billing/upgrade';
import type { PricingContext } from '@/server/data/pricing';
import {
  applyPriceAction,
  deletePricingSimulationAction,
  getPricingContextAction,
  listPricingSimulationsAction,
  savePricingProfileAction,
  savePricingSimulationAction,
} from '@/server/actions/pricing-actions';

/*
  Calculadora de preço em três partes: "Meus gastos mensais", "Custo deste produto ou serviço" e
  "Quanto cobrar". A demonstração (plano Básico) usa dados de exemplo editáveis e as MESMAS contas
  (src/lib/pricing.ts); a versão completa usa os dados reais da empresa, salva simulações e aplica
  o preço no catálogo.
*/

type Method = 'CASH' | 'PIX' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'BANK_TRANSFER' | 'OTHER';
const METHOD_LABEL: Record<Method, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  DEBIT_CARD: 'Débito',
  CREDIT_CARD: 'Crédito',
  BANK_TRANSFER: 'Transferência',
  OTHER: 'Outro',
};

type SupplyRow = { name: string; packagePrice: string; packageQty: string; perService: string };

type Monthly = {
  useRecurring: boolean;
  extraFixed: string;
  ownerWithdrawal: string;
  availableHours: string;
  occupancy: string;
  taxPercent: string;
  targetMargin: string;
  method: Method;
};

type ServiceForm = {
  serviceId: string;
  name: string;
  agendaMinutes: string;
  currentPrice: string;
  supplies: SupplyRow[];
  otherDirect: string;
  commissionKind: 'percent' | 'fixed' | 'none';
  commissionValue: string;
  fixedFee: string;
};

type ProductForm = {
  productId: string;
  name: string;
  lotPrice: string;
  lotUnits: string;
  lotFreight: string;
  packaging: string;
  sharedPerUnit: string;
  currentPrice: string;
};

const num = (v: string | number | undefined | null) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const raw = String(v ?? '').trim();
  // "1.234,56" (com vírgula, o ponto é milhar) ou "77.78" (sem vírgula, o ponto é decimal).
  const n = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
  return Number.isFinite(n) ? n : 0;
};
/** Mostra número no campo no formato brasileiro (vírgula decimal, sem milhar). */
const str = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));
const pct = (v: number | null) =>
  v === null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/* ---------------------------------- Dados de exemplo ---------------------------------- */

const DEMO_FEES: { paymentMethod: Method; feePercent: number }[] = [
  { paymentMethod: 'PIX', feePercent: 0 },
  { paymentMethod: 'CASH', feePercent: 0 },
  { paymentMethod: 'DEBIT_CARD', feePercent: 2 },
  { paymentMethod: 'CREDIT_CARD', feePercent: 4 },
];

const DEMO_MONTHLY: Monthly = {
  useRecurring: false,
  extraFixed: '2400',
  ownerWithdrawal: '3600',
  availableHours: '160',
  occupancy: '75',
  taxPercent: '6',
  targetMargin: '20',
  method: 'CREDIT_CARD',
};

const DEMO_SERVICE: ServiceForm = {
  serviceId: 'demo',
  name: 'Limpeza de pele (exemplo)',
  agendaMinutes: '60',
  currentPrice: '100',
  supplies: [
    { name: 'Sérum (frasco de 500 ml)', packagePrice: '80', packageQty: '500', perService: '25' },
    {
      name: 'Máscara facial (caixa com 30)',
      packagePrice: '300',
      packageQty: '30',
      perService: '1',
    },
    {
      name: 'Kit descartável: luva, touca e lençol (25 kits)',
      packagePrice: '150',
      packageQty: '25',
      perService: '1',
    },
  ],
  otherDirect: '0',
  commissionKind: 'none',
  commissionValue: '0',
  fixedFee: '0',
};

const DEMO_PRODUCT: ProductForm = {
  productId: 'demo',
  name: 'Protetor solar (exemplo)',
  lotPrice: '300',
  lotUnits: '10',
  lotFreight: '20',
  packaging: '1',
  sharedPerUnit: '0',
  currentPrice: '50',
};

/* ------------------------------------- Componentes ------------------------------------- */

function Field({
  label,
  hint,
  suffix,
  value,
  onChange,
  disabled,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[12px] font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        <Input
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^\d,.-]/g, ''))}
          aria-label={label}
        />
        {suffix && <span className="text-label-secondary shrink-0 text-[12px]">{suffix}</span>}
      </div>
      {hint && <span className="text-label-secondary text-[11px]">{hint}</span>}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[13px]">
      <span className="text-label-secondary">{label}</span>
      <strong
        className={cn(
          'tabular-nums',
          tone === 'good' && 'text-system-green',
          tone === 'bad' && 'text-system-red',
        )}
      >
        {value}
      </strong>
    </div>
  );
}

function Section({
  step,
  title,
  description,
  children,
  actions,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Surface className="flex flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="bg-system-blue/12 text-system-blue flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold">
            {step}
          </span>
          <div>
            <h3 className="text-[17px] font-semibold">{title}</h3>
            {description && <p className="text-label-secondary text-[13px]">{description}</p>}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </Surface>
  );
}

/* --------------------------------------- Principal --------------------------------------- */

export function PricingTab({ offer }: { offer: UpgradeOffer | null }) {
  return offer ? <PricingDemo offer={offer} /> : <PricingReal />;
}

function PricingDemo({ offer }: { offer: UpgradeOffer }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-system-blue/8 flex flex-col gap-3 rounded-[22px] p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <SparklesIcon className="text-system-blue mt-0.5 size-5 shrink-0" />
          <div>
            <p className="text-[15px] font-semibold">Demonstração com dados de exemplo</p>
            <p className="text-label-secondary text-[13px]">
              Mude os números à vontade para entender a conta. Nada aqui é salvo nem muda os seus
              preços. No plano {offer.planName}, a calculadora usa os seus gastos, serviços e
              produtos de verdade.
            </p>
          </div>
        </div>
        <Link
          href="/assinatura"
          className="bg-system-blue shrink-0 rounded-full px-5 py-2 text-center text-[14px] font-semibold text-white"
        >
          Calcular com meus serviços
        </Link>
      </div>
      <Calculator mode="demo" />
    </div>
  );
}

function PricingReal() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['pricing-context'],
    queryFn: () => getPricingContextAction().then(unwrapResult),
  });
  if (error) return <p className="text-system-red text-[14px]">{(error as Error).message}</p>;
  if (isLoading || !data) return <Skeleton className="h-[640px] rounded-[22px]" />;
  return <Calculator mode="real" context={data} />;
}

function monthlyFromProfile(ctx: PricingContext): Monthly {
  const p = ctx.profile;
  return {
    useRecurring: p.useRecurringExpenses,
    extraFixed: str(p.extraFixedMonthly),
    ownerWithdrawal: str(p.ownerWithdrawal),
    availableHours: str(p.availableHours),
    occupancy: str(p.occupancyPercent),
    taxPercent: str(p.taxPercent),
    targetMargin: str(p.targetMarginPercent),
    method: (p.defaultPaymentMethod as Method | null) ?? 'PIX',
  };
}

function serviceForm(s: PricingContext['services'][number]): ServiceForm {
  return {
    serviceId: s.id,
    name: s.name,
    agendaMinutes: String(s.agendaMinutes),
    currentPrice: str(s.price),
    // Da ficha de consumo: custo por unidade do estoque × quantidade gasta.
    supplies: s.supplies.map((sup) => ({
      name: `${sup.name} (${unitShort(sup.unit)})`,
      packagePrice: str(sup.unitCost),
      packageQty: '1',
      perService: String(sup.quantity),
    })),
    otherDirect: '0',
    commissionKind: s.commission.kind,
    commissionValue: s.commission.kind === 'none' ? '0' : str(s.commission.value),
    fixedFee: '0',
  };
}

function productForm(p: PricingContext['products'][number]): ProductForm {
  return {
    productId: p.id,
    name: p.name,
    lotPrice: str(p.costPrice),
    lotUnits: '1',
    lotFreight: '0',
    packaging: '0',
    sharedPerUnit: '0',
    currentPrice: str(p.salePrice),
  };
}

const EMPTY_SERVICE: ServiceForm = {
  serviceId: '',
  name: '',
  agendaMinutes: '60',
  currentPrice: '0',
  supplies: [],
  otherDirect: '0',
  commissionKind: 'none',
  commissionValue: '0',
  fixedFee: '0',
};
const EMPTY_PRODUCT: ProductForm = {
  productId: '',
  name: '',
  lotPrice: '0',
  lotUnits: '1',
  lotFreight: '0',
  packaging: '0',
  sharedPerUnit: '0',
  currentPrice: '0',
};

function Calculator({ mode, context }: { mode: 'demo' | 'real'; context?: PricingContext }) {
  const queryClient = useQueryClient();
  const isDemo = mode === 'demo';
  const fees = React.useMemo(
    () =>
      isDemo
        ? DEMO_FEES
        : (context?.fees ?? []).map((f) => ({
            paymentMethod: f.paymentMethod as Method,
            feePercent: f.feePercent,
          })),
    [isDemo, context],
  );

  const [monthly, setMonthly] = React.useState<Monthly>(() =>
    isDemo ? DEMO_MONTHLY : monthlyFromProfile(context!),
  );
  const [kind, setKind] = React.useState<'service' | 'product'>('service');
  const [service, setService] = React.useState<ServiceForm>(() =>
    isDemo
      ? DEMO_SERVICE
      : context!.services[0]
        ? serviceForm(context!.services[0])
        : EMPTY_SERVICE,
  );
  const [product, setProduct] = React.useState<ProductForm>(() =>
    isDemo
      ? DEMO_PRODUCT
      : context!.products[0]
        ? productForm(context!.products[0])
        : EMPTY_PRODUCT,
  );
  const [discount, setDiscount] = React.useState(isDemo ? '10' : '0');
  const [applying, setApplying] = React.useState<{ label: string; price: number } | null>(null);
  const [simName, setSimName] = React.useState('');

  const setM = (patch: Partial<Monthly>) => setMonthly((m) => ({ ...m, ...patch }));
  const setS = (patch: Partial<ServiceForm>) => setService((s) => ({ ...s, ...patch }));
  const setP = (patch: Partial<ProductForm>) => setProduct((p) => ({ ...p, ...patch }));

  // ---------- Contas ----------
  const recurringTotal = isDemo ? 0 : (context?.recurringTotal ?? 0);
  const fixedMonthly = (monthly.useRecurring ? recurringTotal : 0) + num(monthly.extraFixed);
  const feeOf = (m: Method) => fees.find((f) => f.paymentMethod === m)?.feePercent ?? 0;
  const commissionPct = service.commissionKind === 'percent' ? num(service.commissionValue) : 0;
  const commissionFixed = service.commissionKind === 'fixed' ? num(service.commissionValue) : 0;
  const ratesFor = (m: Method, forProduct = false) =>
    (num(monthly.taxPercent) + feeOf(m) + (forProduct ? 0 : commissionPct)) / 100;

  const supplyCosts = service.supplies.map((s) =>
    supplyCost(num(s.packagePrice), num(s.packageQty), num(s.perService)),
  );
  const suppliesTotal = supplyCosts.reduce<number>((sum, c) => sum + (c ?? 0), 0);

  const inputs: PricingInputs = {
    fixedMonthly,
    ownerWithdrawal: num(monthly.ownerWithdrawal),
    availableHours: num(monthly.availableHours),
    occupancyPercent: num(monthly.occupancy),
    durationMinutes: num(service.agendaMinutes),
    supplies: suppliesTotal,
    otherDirectCosts: num(service.otherDirect),
    fixedChargesPerService: commissionFixed + num(service.fixedFee),
    percentRates: ratesFor(monthly.method),
    targetMargin: num(monthly.targetMargin) / 100,
  };
  const result = calculatePricing(inputs);
  const currentPrice = num(service.currentPrice);

  const resaleInputs: ResaleInputs = {
    lotPrice: num(product.lotPrice),
    lotUnits: num(product.lotUnits),
    lotFreight: num(product.lotFreight),
    packagingPerUnit: num(product.packaging),
    sharedPerUnit: num(product.sharedPerUnit),
    percentRates: ratesFor(monthly.method, true),
    targetMargin: num(monthly.targetMargin) / 100,
  };
  const resale = calculateResale(resaleInputs);
  const productPrice = num(product.currentPrice);

  // ---------- Ações (versão completa) ----------
  const saveProfile = useMutation({
    mutationFn: () =>
      savePricingProfileAction({
        useRecurringExpenses: monthly.useRecurring,
        extraFixedMonthly: num(monthly.extraFixed),
        ownerWithdrawal: num(monthly.ownerWithdrawal),
        availableHours: num(monthly.availableHours),
        occupancyPercent: Math.min(100, num(monthly.occupancy)),
        taxPercent: Math.min(100, num(monthly.taxPercent)),
        targetMarginPercent: Math.min(100, num(monthly.targetMargin)),
        defaultPaymentMethod: monthly.method,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Gastos mensais salvos.');
      queryClient.invalidateQueries({ queryKey: ['profit-overview'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apply = useMutation({
    mutationFn: (price: number) =>
      applyPriceAction({
        kind,
        id: kind === 'service' ? service.serviceId : product.productId,
        price,
      }).then(unwrapResult),
    onSuccess: (r) => {
      toast.success(
        `${r.name}: preço de ${formatCurrencyBRL(r.before)} para ${formatCurrencyBRL(r.price)}.`,
      );
      if (kind === 'service') setS({ currentPrice: str(r.price) });
      else setP({ currentPrice: str(r.price) });
      setApplying(null);
      queryClient.invalidateQueries({ queryKey: ['pricing-context'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const simulations = useQuery({
    queryKey: ['pricing-simulations'],
    queryFn: () => listPricingSimulationsAction().then(unwrapResult),
    enabled: !isDemo,
  });

  const saveSim = useMutation({
    mutationFn: () => {
      const summary =
        kind === 'service'
          ? {
              currentPrice,
              minPrice: result.minPrice,
              targetPrice: result.targetPrice,
              base: result.base,
              profitPerHourAtCurrent: outcomeAt(inputs, currentPrice).profitPerHour,
              marginAtCurrent: outcomeAt(inputs, currentPrice).margin,
            }
          : {
              currentPrice: productPrice,
              minPrice: resale.minPrice,
              targetPrice: resale.targetPrice,
              base: resale.base,
              marginAtCurrent: resaleOutcome(resaleInputs, productPrice)?.margin ?? null,
            };
      const flat: Record<string, string | number | boolean | null> = {
        ...monthly,
        fixedMonthly,
        discount,
        ...(kind === 'service'
          ? {
              serviceName: service.name,
              agendaMinutes: service.agendaMinutes,
              suppliesTotal,
              otherDirect: service.otherDirect,
              commissionKind: service.commissionKind,
              commissionValue: service.commissionValue,
              fixedFee: service.fixedFee,
              currentPrice: service.currentPrice,
            }
          : { ...product }),
      };
      return savePricingSimulationAction({
        name: simName.trim() || (kind === 'service' ? service.name : product.name) || 'Simulação',
        kind,
        serviceId: kind === 'service' && service.serviceId ? service.serviceId : null,
        productId: kind === 'product' && product.productId ? product.productId : null,
        inputs: flat,
        summary,
      }).then(unwrapResult);
    },
    onSuccess: () => {
      toast.success('Simulação salva.');
      setSimName('');
      queryClient.invalidateQueries({ queryKey: ['pricing-simulations'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSim = useMutation({
    mutationFn: (id: string) => deletePricingSimulationAction({ id }).then(unwrapResult),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pricing-simulations'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const canApply = !isDemo && (kind === 'service' ? !!service.serviceId : !!product.productId);

  // ---------- Tela ----------
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1. Meus gastos mensais */}
        <Section
          step={1}
          title="Meus gastos mensais"
          description="O que mantém o negócio aberto e quanto você quer tirar para você."
          actions={
            !isDemo && (
              <Button
                size="sm"
                disabled={saveProfile.isPending}
                onClick={() => saveProfile.mutate()}
              >
                <CheckIcon /> {saveProfile.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            )
          }
        >
          {!isDemo && (
            <label className="bg-foreground/[0.03] flex items-center justify-between gap-3 rounded-2xl p-3">
              <span className="flex flex-col">
                <span className="text-[13px] font-medium">
                  Usar as contas fixas cadastradas ({formatCurrencyBRL(recurringTotal)}/mês)
                </span>
                <span className="text-label-secondary text-[11px]">
                  {context!.recurring.length
                    ? context!.recurring
                        .slice(0, 4)
                        .map((r) => `${r.description} ${formatCurrencyBRL(r.amount)}`)
                        .join(' · ') + (context!.recurring.length > 4 ? ' …' : '')
                    : 'Nenhuma conta fixa ainda — cadastre em Financeiro → Contas fixas.'}
                </span>
              </span>
              <Switch
                checked={monthly.useRecurring}
                onCheckedChange={(on: boolean) => setM({ useRecurring: on })}
                aria-label="Usar as contas fixas cadastradas"
              />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={isDemo ? 'Despesas fixas (R$/mês)' : 'Outras despesas fixas (R$/mês)'}
              hint={isDemo ? 'Aluguel, contas, sistema...' : 'O que não está nas contas fixas'}
              value={monthly.extraFixed}
              onChange={(v) => setM({ extraFixed: v })}
            />
            <Field
              label="Retirada do dono (R$/mês)"
              hint="O seu pró-labore"
              value={monthly.ownerWithdrawal}
              onChange={(v) => setM({ ownerWithdrawal: v })}
            />
            <Field
              label="Horas para atender no mês"
              hint="Da equipe toda"
              suffix="h"
              value={monthly.availableHours}
              onChange={(v) => setM({ availableHours: v })}
            />
            <Field
              label="Ocupação esperada da agenda"
              suffix="%"
              hint={`= ${result.expectedHours.toLocaleString('pt-BR')} h atendendo`}
              value={monthly.occupancy}
              onChange={(v) => setM({ occupancy: v })}
            />
            <Field
              label="Impostos sobre a venda"
              suffix="%"
              hint="Simples, MEI..."
              value={monthly.taxPercent}
              onChange={(v) => setM({ taxPercent: v })}
            />
            <Field
              label="Margem de lucro desejada"
              suffix="%"
              value={monthly.targetMargin}
              onChange={(v) => setM({ targetMargin: v })}
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium">Forma de pagamento mais comum</span>
            <Select
              value={monthly.method}
              onValueChange={(v: string) => setM({ method: v as Method })}
            >
              <SelectTrigger aria-label="Forma de pagamento mais comum">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fees.map((f) => (
                  <SelectItem key={f.paymentMethod} value={f.paymentMethod}>
                    {METHOD_LABEL[f.paymentMethod]} · taxa {str(f.feePercent)}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isDemo && (
              <span className="text-label-secondary text-[11px]">
                As taxas vêm de Financeiro → Ajustes.
              </span>
            )}
          </label>
          <div className="bg-foreground/[0.03] grid gap-1 rounded-2xl p-3">
            <Stat label="Despesas fixas no mês" value={formatCurrencyBRL(fixedMonthly)} />
            <Stat label="Custo fixo por hora" value={formatCurrencyBRL(result.fixedPerHour)} />
            <Stat label="Retirada por hora" value={formatCurrencyBRL(result.withdrawalPerHour)} />
          </div>
        </Section>

        {/* 2. Custo deste produto ou serviço */}
        <Section
          step={2}
          title="Custo deste produto ou serviço"
          description="O que cada atendimento ou unidade vendida custa para você."
        >
          <SegmentedControl
            size="sm"
            value={kind}
            onValueChange={setKind}
            options={[
              { value: 'service', label: 'Serviço' },
              { value: 'product', label: 'Produto de revenda' },
            ]}
            className="self-start"
          />
          {kind === 'service' ? (
            <div className="flex flex-col gap-3">
              {!isDemo && (
                <Select
                  value={service.serviceId}
                  onValueChange={(id: string) => {
                    const s = context!.services.find((x) => x.id === id);
                    if (s) setService(serviceForm(s));
                  }}
                >
                  <SelectTrigger aria-label="Serviço">
                    <SelectValue placeholder="Escolha o serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {context!.services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} · {formatCurrencyBRL(s.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!isDemo && context!.services.length === 0 && (
                <p className="text-label-secondary text-[13px]">
                  Nenhum serviço ativo. Cadastre em{' '}
                  <Link href="/servicos" className="text-system-blue underline">
                    Serviços
                  </Link>
                  .
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Tempo na agenda"
                  suffix="min"
                  hint="Com preparo e limpeza"
                  value={service.agendaMinutes}
                  onChange={(v) => setS({ agendaMinutes: v })}
                />
                <Field
                  label="Preço atual (R$)"
                  value={service.currentPrice}
                  onChange={(v) => setS({ currentPrice: v })}
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[12px] font-medium">Insumos por atendimento</span>
                {service.supplies.map((s, i) => (
                  <div
                    key={i}
                    className="bg-foreground/[0.03] flex flex-col gap-2 rounded-xl p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Insumo"
                        value={s.name}
                        aria-label={`Nome do insumo ${i + 1}`}
                        onChange={(e) =>
                          setS({
                            supplies: service.supplies.map((r, j) =>
                              j === i ? { ...r, name: e.target.value } : r,
                            ),
                          })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remover insumo"
                        onClick={() =>
                          setS({ supplies: service.supplies.filter((_, j) => j !== i) })
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ['packagePrice', 'Preço da embalagem (R$)'],
                          ['packageQty', 'Rende (qtd.)'],
                          ['perService', 'Gasto por atendimento'],
                        ] as const
                      ).map(([key, label]) => (
                        <Field
                          key={key}
                          label={label}
                          value={s[key]}
                          onChange={(v) =>
                            setS({
                              supplies: service.supplies.map((r, j) =>
                                j === i ? { ...r, [key]: v } : r,
                              ),
                            })
                          }
                        />
                      ))}
                    </div>
                    <span className="text-label-secondary text-[11px]">
                      Custo por atendimento:{' '}
                      <strong className="text-foreground tabular-nums">
                        {supplyCosts[i] === null
                          ? 'informe quanto rende'
                          : formatCurrencyBRL(supplyCosts[i]!)}
                      </strong>
                    </span>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    setS({
                      supplies: [
                        ...service.supplies,
                        { name: '', packagePrice: '0', packageQty: '1', perService: '1' },
                      ],
                    })
                  }
                >
                  <PlusIcon /> Adicionar insumo
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Outros custos diretos (R$)"
                  hint="Ex.: lavanderia da toalha"
                  value={service.otherDirect}
                  onChange={(v) => setS({ otherDirect: v })}
                />
                <Field
                  label="Taxa fixa por atendimento (R$)"
                  hint="Ex.: tarifa fixa da maquininha"
                  value={service.fixedFee}
                  onChange={(v) => setS({ fixedFee: v })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium">Comissão</span>
                  <Select
                    value={service.commissionKind}
                    onValueChange={(v: string) =>
                      setS({ commissionKind: v as ServiceForm['commissionKind'] })
                    }
                  >
                    <SelectTrigger aria-label="Tipo de comissão">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem comissão</SelectItem>
                      <SelectItem value="percent">% do preço</SelectItem>
                      <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                {service.commissionKind !== 'none' && (
                  <Field
                    label={service.commissionKind === 'percent' ? 'Comissão (%)' : 'Comissão (R$)'}
                    hint={
                      !isDemo
                        ? context!.services.find((s) => s.id === service.serviceId)?.commission
                            .source
                        : undefined
                    }
                    value={service.commissionValue}
                    onChange={(v) => setS({ commissionValue: v })}
                  />
                )}
              </div>
              <div className="bg-foreground/[0.03] grid gap-1 rounded-2xl p-3">
                <Stat label="Insumos" value={formatCurrencyBRL(suppliesTotal)} />
                <Stat
                  label="Custos diretos (insumos + outros + fixos)"
                  value={formatCurrencyBRL(result.directCosts)}
                />
                <Stat
                  label={`Tempo × (custo fixo + retirada por hora)`}
                  value={formatCurrencyBRL(result.base - result.directCosts)}
                />
                <Stat label="Custo base do atendimento" value={formatCurrencyBRL(result.base)} />
                <Stat
                  label="Taxas sobre o preço (impostos + cartão + comissão %)"
                  value={pct(inputs.percentRates)}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {!isDemo && (
                <Select
                  value={product.productId}
                  onValueChange={(id: string) => {
                    const p = context!.products.find((x) => x.id === id);
                    if (p) setProduct(productForm(p));
                  }}
                >
                  <SelectTrigger aria-label="Produto">
                    <SelectValue placeholder="Escolha o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {context!.products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · venda {formatCurrencyBRL(p.salePrice)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Paguei no lote (R$)"
                  value={product.lotPrice}
                  onChange={(v) => setP({ lotPrice: v })}
                />
                <Field
                  label="Unidades no lote"
                  value={product.lotUnits}
                  onChange={(v) => setP({ lotUnits: v })}
                />
                <Field
                  label="Frete da compra (R$)"
                  hint="Do lote todo; é dividido pelas unidades"
                  value={product.lotFreight}
                  onChange={(v) => setP({ lotFreight: v })}
                />
                <Field
                  label="Embalagem por unidade (R$)"
                  value={product.packaging}
                  onChange={(v) => setP({ packaging: v })}
                />
                <Field
                  label="Parte das despesas por unidade (R$)"
                  hint="Opcional: rateio de despesas da loja"
                  value={product.sharedPerUnit}
                  onChange={(v) => setP({ sharedPerUnit: v })}
                />
                <Field
                  label="Preço atual (R$)"
                  value={product.currentPrice}
                  onChange={(v) => setP({ currentPrice: v })}
                />
              </div>
              <div className="bg-foreground/[0.03] grid gap-1 rounded-2xl p-3">
                <Stat
                  label="Custo por unidade (compra + frete + embalagem)"
                  value={resale.unitCost === null ? '—' : formatCurrencyBRL(resale.unitCost)}
                />
                <Stat
                  label="Taxas sobre o preço (impostos + cartão)"
                  value={pct(resaleInputs.percentRates)}
                />
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* 3. Quanto cobrar */}
      <Section
        step={3}
        title="Quanto cobrar"
        description="Preço atual, o mínimo que cobre tudo e o preço que entrega a sua margem."
      >
        {kind === 'service' && result.problems.length > 0 && (
          <div className="bg-system-orange/10 flex flex-col gap-1 rounded-2xl p-3 text-[13px]">
            {result.problems.map((p) => (
              <span key={p} className="flex items-start gap-2">
                <AlertTriangleIcon className="text-system-orange mt-0.5 size-4 shrink-0" />
                {PRICING_PROBLEM_TEXT[p]}
              </span>
            ))}
          </div>
        )}
        {kind === 'service' ? (
          <ServicePrices
            inputs={inputs}
            current={currentPrice}
            minPrice={result.minPrice}
            targetPrice={result.targetPrice}
            onApply={canApply ? (label, price) => setApplying({ label, price }) : undefined}
          />
        ) : (
          <ProductPrices
            inputs={resaleInputs}
            current={productPrice}
            onApply={canApply ? (label, price) => setApplying({ label, price }) : undefined}
          />
        )}

        {kind === 'service' && result.problems.length === 0 && (
          <div className="grid gap-4 lg:grid-cols-3">
            <DiscountSim
              inputs={inputs}
              price={currentPrice}
              discount={discount}
              onDiscount={setDiscount}
            />
            <OccupancySim inputs={inputs} price={currentPrice} />
            <PaymentSim
              inputs={inputs}
              price={currentPrice}
              fees={fees}
              ratesFor={(m) => ratesFor(m)}
            />
          </div>
        )}

        {!isDemo && (
          <div className="border-foreground/[0.06] flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[12px] font-medium">Salvar esta simulação</span>
              <Input
                placeholder={
                  (kind === 'service' ? service.name : product.name) || 'Nome da simulação'
                }
                value={simName}
                maxLength={120}
                onChange={(e) => setSimName(e.target.value)}
              />
            </label>
            <Button variant="outline" disabled={saveSim.isPending} onClick={() => saveSim.mutate()}>
              <BookmarkPlusIcon /> {saveSim.isPending ? 'Salvando...' : 'Salvar simulação'}
            </Button>
          </div>
        )}
      </Section>

      {!isDemo && (simulations.data?.length ?? 0) > 0 && (
        <Surface className="flex flex-col gap-2 p-4 md:p-5">
          <h3 className="text-[15px] font-semibold">Simulações salvas</h3>
          <div className="flex flex-col divide-y divide-[color:var(--separator)]">
            {simulations.data!.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="text-label-secondary text-[12px]">
                    {new Date(s.createdAt).toLocaleDateString('pt-BR')} ·{' '}
                    {s.kind === 'service' ? 'serviço' : 'produto'} · atual{' '}
                    {formatCurrencyBRL(Number(s.summary.currentPrice ?? 0))} · mínimo{' '}
                    {s.summary.minPrice == null
                      ? '—'
                      : formatCurrencyBRL(Number(s.summary.minPrice))}{' '}
                    · meta{' '}
                    {s.summary.targetPrice == null
                      ? '—'
                      : formatCurrencyBRL(Number(s.summary.targetPrice))}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Apagar simulação ${s.name}`}
                  onClick={() => removeSim.mutate(s.id)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
          </div>
        </Surface>
      )}

      <ConfirmDialog
        open={applying !== null}
        onOpenChange={(open) => !open && setApplying(null)}
        title={`Aplicar ${applying ? formatCurrencyBRL(applying.price) : ''}?`}
        description={`O ${applying?.label.toLowerCase()} passa a ser o preço de "${
          kind === 'service' ? service.name : product.name
        }" no catálogo. Atendimentos já marcados mantêm o preço combinado.`}
        confirmLabel="Aplicar preço"
        pending={apply.isPending}
        onConfirm={() => applying && apply.mutate(applying.price)}
      />
    </div>
  );
}

function PriceCard({
  title,
  price,
  highlight,
  children,
  onApply,
}: {
  title: string;
  price: number | null;
  highlight?: boolean;
  children?: React.ReactNode;
  onApply?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-2xl p-4',
        highlight ? 'bg-system-blue/8 ring-system-blue/30 ring-1' : 'bg-foreground/[0.03]',
      )}
    >
      <span className="text-label-secondary text-[12px] font-medium">{title}</span>
      <span className="text-[26px] leading-none font-bold tracking-[-0.02em] tabular-nums">
        {price === null ? '—' : formatCurrencyBRL(price)}
      </span>
      <div className="grid gap-1">{children}</div>
      {onApply && price !== null && (
        <Button size="sm" variant={highlight ? 'default' : 'outline'} onClick={onApply}>
          Aplicar preço
        </Button>
      )}
    </div>
  );
}

function OutcomeStats({ inputs, price }: { inputs: PricingInputs; price: number }) {
  const o = outcomeAt(inputs, price);
  return (
    <>
      <Stat
        label="Lucro por atendimento"
        value={formatCurrencyBRL(o.profit)}
        tone={o.profit >= 0 ? 'good' : 'bad'}
      />
      <Stat label="Margem" value={pct(o.margin)} tone={(o.margin ?? 0) >= 0 ? undefined : 'bad'} />
      <Stat
        label="Disponível por hora"
        value={o.availablePerHour === null ? '—' : formatCurrencyBRL(o.availablePerHour)}
      />
      <Stat
        label="Lucro por hora (após a retirada)"
        value={o.profitPerHour === null ? '—' : formatCurrencyBRL(o.profitPerHour)}
        tone={(o.profitPerHour ?? 0) >= 0 ? 'good' : 'bad'}
      />
    </>
  );
}

function ServicePrices({
  inputs,
  current,
  minPrice,
  targetPrice,
  onApply,
}: {
  inputs: PricingInputs;
  current: number;
  minPrice: number | null;
  targetPrice: number | null;
  onApply?: (label: string, price: number) => void;
}) {
  const ok = calculatePricing(inputs).problems.filter((p) => p !== 'margin').length === 0;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <PriceCard title="Preço atual" price={current}>
        {ok && <OutcomeStats inputs={inputs} price={current} />}
        {ok && minPrice !== null && current < minPrice && (
          <span className="text-system-red text-[12px]">
            Abaixo do mínimo: cada atendimento deixa de pagar a sua retirada.
          </span>
        )}
      </PriceCard>
      <PriceCard
        title="Preço mínimo sustentável"
        price={minPrice}
        onApply={onApply && minPrice !== null ? () => onApply('Preço mínimo', minPrice) : undefined}
      >
        {minPrice !== null && <OutcomeStats inputs={inputs} price={minPrice} />}
        <span className="text-label-secondary text-[11px]">
          Cobre custos, taxas e a sua retirada, sem lucro.
        </span>
      </PriceCard>
      <PriceCard
        title={`Preço para margem de ${pct(inputs.targetMargin)}`}
        price={targetPrice}
        highlight
        onApply={
          onApply && targetPrice !== null
            ? () => onApply('Preço para a meta', targetPrice)
            : undefined
        }
      >
        {targetPrice !== null && <OutcomeStats inputs={inputs} price={targetPrice} />}
      </PriceCard>
    </div>
  );
}

function ProductPrices({
  inputs,
  current,
  onApply,
}: {
  inputs: ResaleInputs;
  current: number;
  onApply?: (label: string, price: number) => void;
}) {
  const r = calculateResale(inputs);
  const row = (price: number | null) => {
    if (price === null) return null;
    const o = resaleOutcome(inputs, price);
    if (!o) return null;
    return (
      <>
        <Stat
          label="Lucro por unidade"
          value={formatCurrencyBRL(o.profit)}
          tone={o.profit >= 0 ? 'good' : 'bad'}
        />
        <Stat label="Margem" value={pct(o.margin)} />
      </>
    );
  };
  if (r.unitCost === null) {
    return (
      <p className="text-system-orange text-[13px]">Informe quantas unidades vieram no lote.</p>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <PriceCard title="Preço atual" price={current}>
        {row(current)}
      </PriceCard>
      <PriceCard
        title="Preço mínimo sustentável"
        price={r.minPrice}
        onApply={
          onApply && r.minPrice !== null ? () => onApply('Preço mínimo', r.minPrice!) : undefined
        }
      >
        {row(r.minPrice)}
      </PriceCard>
      <PriceCard
        title={`Preço para margem de ${pct(inputs.targetMargin)}`}
        price={r.targetPrice}
        highlight
        onApply={
          onApply && r.targetPrice !== null
            ? () => onApply('Preço para a meta', r.targetPrice!)
            : undefined
        }
      >
        {row(r.targetPrice)}
      </PriceCard>
    </div>
  );
}

function SimBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-foreground/[0.03] flex flex-col gap-2 rounded-2xl p-3.5">
      <span className="text-[13px] font-semibold">{title}</span>
      {children}
    </div>
  );
}

function DiscountSim({
  inputs,
  price,
  discount,
  onDiscount,
}: {
  inputs: PricingInputs;
  price: number;
  discount: string;
  onDiscount: (v: string) => void;
}) {
  const d = Math.min(num(discount), price);
  const before = outcomeAt(inputs, price);
  const after = outcomeAt(inputs, price - d);
  return (
    <SimBox title="E se eu der desconto?">
      <Field label="Desconto (R$)" value={discount} onChange={onDiscount} />
      <Stat label="Cliente paga" value={formatCurrencyBRL(price - d)} />
      <Stat
        label="Lucro do atendimento"
        value={`${formatCurrencyBRL(after.profit)} (era ${formatCurrencyBRL(before.profit)})`}
        tone={after.profit >= 0 ? undefined : 'bad'}
      />
      <Stat label="Margem" value={`${pct(after.margin)} (era ${pct(before.margin)})`} />
      {before.profit > 0 && d > 0 && (
        <span className="text-label-secondary text-[11px]">
          O desconto de {formatCurrencyBRL(d)} tira{' '}
          {Math.round(((before.profit - after.profit) / before.profit) * 100)}% do seu lucro.
        </span>
      )}
    </SimBox>
  );
}

function OccupancySim({ inputs, price }: { inputs: PricingInputs; price: number }) {
  const levels = [50, 60, 75, 90, 100];
  return (
    <SimBox title="E se a agenda encher (ou esvaziar)?">
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 text-[12px]">
        <span className="text-label-secondary">Ocupação</span>
        <span className="text-label-secondary text-right">Mínimo</span>
        <span className="text-label-secondary text-right">Lucro a {formatCurrencyBRL(price)}</span>
        {levels.map((level) => {
          const i = { ...inputs, occupancyPercent: level };
          const r = calculatePricing(i);
          const o = outcomeAt(i, price);
          const isCurrent = Math.round(inputs.occupancyPercent) === level;
          return (
            <React.Fragment key={level}>
              <span className={cn(isCurrent && 'font-semibold')}>{level}%</span>
              <span className="text-right tabular-nums">
                {r.minPrice === null ? '—' : formatCurrencyBRL(r.minPrice)}
              </span>
              <span
                className={cn(
                  'text-right tabular-nums',
                  o.profit < 0 ? 'text-system-red' : 'text-system-green',
                )}
              >
                {formatCurrencyBRL(o.profit)}
              </span>
            </React.Fragment>
          );
        })}
      </div>
      <span className="text-label-secondary text-[11px]">
        Agenda mais cheia dilui o custo fixo: o mesmo preço deixa mais lucro.
      </span>
    </SimBox>
  );
}

function PaymentSim({
  inputs,
  price,
  fees,
  ratesFor,
}: {
  inputs: PricingInputs;
  price: number;
  fees: { paymentMethod: Method; feePercent: number }[];
  ratesFor: (m: Method) => number;
}) {
  return (
    <SimBox title="E se o cliente pagar de outro jeito?">
      <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 text-[12px]">
        <span className="text-label-secondary">Forma</span>
        <span className="text-label-secondary text-right">Lucro</span>
        <span className="text-label-secondary text-right">Mínimo</span>
        {fees.map((f) => {
          const rates = ratesFor(f.paymentMethod);
          const o = outcomeAt(inputs, price, { percentRates: rates });
          const r = calculatePricing({ ...inputs, percentRates: rates });
          return (
            <React.Fragment key={f.paymentMethod}>
              <span>
                {METHOD_LABEL[f.paymentMethod]}{' '}
                <span className="text-label-secondary">({str(f.feePercent)}%)</span>
              </span>
              <span
                className={cn(
                  'text-right tabular-nums',
                  o.profit < 0 ? 'text-system-red' : undefined,
                )}
              >
                {formatCurrencyBRL(o.profit)}
              </span>
              <span className="text-right tabular-nums">
                {r.minPrice === null ? '—' : formatCurrencyBRL(r.minPrice)}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </SimBox>
  );
}
