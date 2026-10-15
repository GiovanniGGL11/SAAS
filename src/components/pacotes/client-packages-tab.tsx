'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlusIcon, DownloadIcon, PackageIcon, PlusIcon } from 'lucide-react';

import { unwrapResult } from '@/lib/action-result';
import { maskMoneyInput, parseMoneyInput } from '@/lib/money-input';
import { formatCurrencyBRL } from '@/lib/serialize';
import { FINANCIAL_STATUS_LABEL, PACKAGE_ALERT_LABEL } from '@/lib/packages';
import { FORM_TYPE_LABEL } from '@/lib/forms/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STATUS_LABELS } from '@/components/agenda/status';
import { useFormAccess } from '@/components/fichas/entry-dialog';
import { RECORD_STATUS_LABEL, SIGNATURE_LABEL, formatDate } from '@/components/fichas/labels';
import { SessionRecordDialog } from '@/components/pacotes/session-record-dialog';
import {
  adjustPackageAction,
  createClientPackageAction,
  extendPackageAction,
  getClientPackagesAction,
  getPackageFormOptionsAction,
  receivePackagePaymentAction,
} from '@/server/actions/package-actions';

type Pkg = Awaited<ReturnType<typeof getClientPackagesAction>>[number];

const METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'CREDIT_CARD', label: 'Crédito' },
  { value: 'DEBIT_CARD', label: 'Débito' },
] as const;
type Method = (typeof METHODS)[number]['value'];

/** Aba "Pacotes e tratamentos": um cartão por pacote, execução e pagamento lado a lado. */
export function ClientPackagesTab({ clientId, timezone }: { clientId: string; timezone: string }) {
  const { data: packages, isLoading } = useQuery({
    queryKey: ['client-packages-detail', clientId],
    queryFn: () => getClientPackagesAction(clientId),
  });
  const [creating, setCreating] = React.useState(false);
  const [showClosed, setShowClosed] = React.useState(false);
  const visible = (packages ?? []).filter((p) => showClosed || p.status === 'ACTIVE');
  const closedCount =
    (packages ?? []).length - (packages ?? []).filter((p) => p.status === 'ACTIVE').length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold">Pacotes e tratamentos</h2>
          <p className="text-label-secondary text-[13px]">
            Sessões contam só ao concluir o atendimento. O pagamento é acompanhado à parte.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon /> Novo pacote
        </Button>
      </div>
      {isLoading ? (
        <p className="text-label-secondary text-[14px]">Carregando…</p>
      ) : visible.length === 0 ? (
        <div className="bg-tile rounded-[22px]">
          <EmptyState
            icon={PackageIcon}
            title="Nenhum pacote ativo"
            description="Cadastre um pacote de sessões — inclusive um contratado antes de usar o sistema (saldo inicial)."
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} clientId={clientId} timezone={timezone} />
          ))}
        </div>
      )}
      {closedCount > 0 && (
        <button
          type="button"
          className="text-system-blue self-start text-[13px] hover:underline"
          onClick={() => setShowClosed((v) => !v)}
        >
          {showClosed
            ? 'Ocultar pacotes cancelados'
            : `Mostrar pacotes cancelados (${closedCount})`}
        </button>
      )}
      {creating && <NewPackageDialog clientId={clientId} onClose={() => setCreating(false)} />}
    </section>
  );
}

function PackageCard({
  pkg,
  clientId,
  timezone,
}: {
  pkg: Pkg;
  clientId: string;
  timezone: string;
}) {
  const { data: access } = useFormAccess();
  const [expanded, setExpanded] = React.useState(false);
  const [dialog, setDialog] = React.useState<'receive' | 'extend' | 'adjust' | null>(null);
  const [recordFor, setRecordFor] = React.useState<string | null>(null);
  const percent = Math.min(100, Math.round((pkg.done / Math.max(pkg.sessionsTotal, 1)) * 100));
  const next = pkg.planned[0];
  const { data: options } = useQuery({
    queryKey: ['package-form-options'],
    queryFn: () => getPackageFormOptionsAction(),
  });

  return (
    <article
      className="bg-tile flex flex-col gap-3 rounded-[22px] p-5 md:p-6"
      aria-label={pkg.name}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-semibold">{pkg.name}</h3>
          <p className="text-label-secondary text-[13px]">
            {pkg.service.name}
            {pkg.responsibleProfessional ? ` · ${pkg.responsibleProfessional.name}` : ''}
            {pkg.recurring ? ' · assinatura mensal' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {pkg.status !== 'ACTIVE' && <Tag tone="gray">Cancelado</Tag>}
          {pkg.alerts.map((a) => (
            <Tag key={a} tone={a === 'expiring' ? 'amber' : 'red'}>
              {PACKAGE_ALERT_LABEL[a]}
            </Tag>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-semibold">
            {pkg.done} de {pkg.sessionsTotal} sessões realizadas
          </span>
          <span className="text-label-secondary text-[13px]">
            {pkg.remaining} {pkg.remaining === 1 ? 'restante' : 'restantes'}
          </span>
        </div>
        <div
          className="bg-foreground/[0.08] h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={pkg.sessionsTotal}
          aria-valuenow={pkg.done}
          aria-label="Sessões realizadas"
        >
          <div
            className="bg-system-blue h-full rounded-full transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
        <Info label="Contratado" value={formatCurrencyBRL(pkg.financial.price)} />
        <Info label="Pago" value={formatCurrencyBRL(pkg.financial.paid)} />
        <Info
          label="Saldo"
          value={
            pkg.financial.pending > 0
              ? `${formatCurrencyBRL(pkg.financial.pending)} no fiado`
              : pkg.financial.unbilled > 0
                ? `${formatCurrencyBRL(pkg.financial.unbilled)} a receber`
                : 'Quitado'
          }
        />
        <Info label="Situação" value={FINANCIAL_STATUS_LABEL[pkg.financial.status]} />
        <Info label="Agendadas" value={String(pkg.planned.length)} />
        <Info
          label="Validade"
          value={pkg.validUntil ? formatDate(pkg.validUntil, timezone) : 'Sem validade'}
        />
        <Info label="Contratado em" value={formatDate(pkg.contractedAt, timezone)} />
        <Info
          label="Próxima sessão"
          value={next ? formatDate(next.startAt, timezone, true) : '—'}
        />
        {pkg.openingPaidAmount !== null && (
          <Info label="Saldo inicial" value="Sim (anterior ao sistema)" />
        )}
      </dl>
      {(pkg.initialFormTemplate || pkg.sessionFormTemplate || pkg.requireSignature) && (
        <p className="text-label-secondary text-[12px]">
          {[
            pkg.initialFormTemplate && `Ficha inicial: ${pkg.initialFormTemplate.name}`,
            pkg.sessionFormTemplate && `Por sessão: ${pkg.sessionFormTemplate.name}`,
            pkg.requireSignature && 'Assinatura por sessão exigida',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {pkg.status === 'ACTIVE' && pkg.remaining > 0 && (
          <Button size="sm" asChild>
            <Link href={`/agenda?cliente=${clientId}&servico=${pkg.service.id}&pacote=${pkg.id}`}>
              <CalendarPlusIcon /> Agendar sessão
            </Link>
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Ocultar acompanhamento' : 'Ver acompanhamento'}
        </Button>
        {!pkg.recurring && pkg.financial.unbilled > 0 && (
          <Button size="sm" variant="outline" onClick={() => setDialog('receive')}>
            Receber pagamento
          </Button>
        )}
        {options?.isAdmin && pkg.status === 'ACTIVE' && !pkg.recurring && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setDialog('extend')}>
              Ampliar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog('adjust')}>
              Corrigir saldo
            </Button>
          </>
        )}
        {access?.canExport && (
          <Button size="sm" variant="ghost" asChild>
            <a href={`/exportar/pacote/${pkg.id}`}>
              <DownloadIcon /> PDF
            </a>
          </Button>
        )}
      </div>

      {expanded && <Timeline pkg={pkg} timezone={timezone} onOpenRecord={setRecordFor} />}

      {dialog === 'receive' && (
        <ReceiveDialog pkg={pkg} clientId={clientId} onClose={() => setDialog(null)} />
      )}
      {dialog === 'extend' && (
        <ExtendDialog pkg={pkg} clientId={clientId} onClose={() => setDialog(null)} />
      )}
      {dialog === 'adjust' && (
        <AdjustDialog pkg={pkg} clientId={clientId} onClose={() => setDialog(null)} />
      )}
      <SessionRecordDialog
        appointmentId={recordFor}
        open={!!recordFor}
        onOpenChange={(o: boolean) => !o && setRecordFor(null)}
        timezone={timezone}
      />
    </article>
  );
}

/** Linha do tempo do pacote: sessões realizadas (com registro e assinatura), saldo inicial, ajustes e as próximas. */
function Timeline({
  pkg,
  timezone,
  onOpenRecord,
}: {
  pkg: Pkg;
  timezone: string;
  onOpenRecord: (id: string) => void;
}) {
  const items = [
    ...pkg.movements.map((m) => ({ kind: 'movement' as const, at: new Date(m.createdAt), m })),
    ...pkg.planned.map((p) => ({ kind: 'planned' as const, at: new Date(p.startAt), p })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  if (items.length === 0) {
    return (
      <p className="text-label-secondary text-[13px]">
        Nenhuma sessão realizada ou agendada ainda.
      </p>
    );
  }
  return (
    <ol className="border-foreground/10 flex flex-col gap-3 border-l pl-4">
      {items.map((item) =>
        item.kind === 'planned' ? (
          <li key={`p-${item.p.id}`} className="text-[13px]">
            <div className="font-medium">
              Agendada · {formatDate(item.p.startAt, timezone, true)}
            </div>
            <div className="text-label-secondary">
              {STATUS_LABELS[item.p.status]} — conta ao concluir
            </div>
          </li>
        ) : (
          <li key={item.m.id} className="text-[13px]">
            {item.m.kind === 'CONSUME' ? (
              <>
                <div className="font-medium">
                  Sessão {item.m.sessionNumber} ·{' '}
                  {item.m.appointment
                    ? formatDate(item.m.appointment.startAt, timezone, true)
                    : formatDate(item.m.createdAt, timezone)}
                </div>
                <div className="text-label-secondary">
                  {item.m.appointment?.professionalName ?? '—'} ·{' '}
                  {item.m.appointment ? STATUS_LABELS[item.m.appointment.status] : '—'} ·{' '}
                  {item.m.record ? RECORD_STATUS_LABEL[item.m.record.status] : 'Sem registro'} ·{' '}
                  {item.m.record
                    ? SIGNATURE_LABEL[item.m.record.signature]
                    : pkg.requireSignature
                      ? 'Assinatura pendente'
                      : ''}
                </div>
                {item.m.appointment && (
                  <button
                    type="button"
                    className="text-system-blue hover:underline"
                    onClick={() => onOpenRecord(item.m.appointment!.id)}
                  >
                    Abrir registro
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="font-medium">
                  {
                    {
                      RESTORE: 'Sessão devolvida',
                      OPENING_DONE: `Saldo inicial: ${item.m.quantity} ${item.m.quantity === 1 ? 'sessão feita' : 'sessões feitas'} antes do sistema`,
                      EXTEND: `Pacote ampliado em ${item.m.quantity} ${item.m.quantity === 1 ? 'sessão' : 'sessões'}`,
                      ADJUST: `Correção de saldo (${item.m.quantity > 0 ? '+' : ''}${item.m.quantity})`,
                      CONSUME: '',
                    }[item.m.kind]
                  }{' '}
                  · {formatDate(item.m.createdAt, timezone)}
                </div>
                {item.m.reason && <div className="text-label-secondary">{item.m.reason}</div>}
              </>
            )}
          </li>
        ),
      )}
    </ol>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-label-secondary text-[12px]">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: 'red' | 'amber' | 'gray' }) {
  const cls =
    tone === 'red'
      ? 'bg-system-red/12 text-system-red'
      : tone === 'amber'
        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
        : 'bg-foreground/[0.06] text-label-secondary';
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

function useInvalidate(clientId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['client-packages-detail', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-packages', clientId] });
    queryClient.invalidateQueries({ queryKey: ['client-tab', clientId] });
  };
}

function MethodPicker({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <SegmentedControl
      size="sm"
      value={value}
      onValueChange={onChange}
      options={METHODS.map((m) => ({ value: m.value, label: m.label }))}
    />
  );
}

function NewPackageDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const invalidate = useInvalidate(clientId);
  const { data: options } = useQuery({
    queryKey: ['package-form-options'],
    queryFn: () => getPackageFormOptionsAction(),
  });
  const [form, setForm] = React.useState(() => ({
    planId: 'none',
    name: '',
    serviceId: '',
    sessions: '8',
    price: '',
    contractedAt: new Date().toISOString().slice(0, 10),
    validUntil: '',
    professionalId: 'none',
    notes: '',
    initialTemplateId: 'none',
    sessionTemplateId: 'none',
    requireSignature: false,
  }));
  const [payment, setPayment] = React.useState<'full' | 'partial' | 'tab' | 'later'>('full');
  const [method, setMethod] = React.useState<Method>('PIX');
  const [partial, setPartial] = React.useState('');
  const [opening, setOpening] = React.useState(false);
  const [openingDone, setOpeningDone] = React.useState('0');
  const [openingPaid, setOpeningPaid] = React.useState('');
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function pickPlan(planId: string) {
    const plan = options?.plans.find((p) => p.id === planId);
    setForm((f) => ({
      ...f,
      planId,
      ...(plan
        ? {
            name: plan.name,
            serviceId: plan.serviceId,
            sessions: String(plan.sessions),
            price: maskMoneyInput(String(Math.round(plan.price * 100))),
            validUntil: plan.validityDays
              ? new Date(Date.now() + plan.validityDays * 86_400_000).toISOString().slice(0, 10)
              : '',
          }
        : {}),
    }));
  }

  const price = parseMoneyInput(form.price);
  const paidBefore = opening ? parseMoneyInput(openingPaid) : 0;
  const toBill = Math.max(price - paidBefore, 0);

  const create = useMutation({
    mutationFn: () =>
      createClientPackageAction({
        clientId,
        planId: form.planId === 'none' ? null : form.planId,
        name: form.name,
        serviceId: form.serviceId,
        sessionsTotal: Number(form.sessions),
        price,
        contractedAt: new Date(`${form.contractedAt}T12:00:00`),
        validUntil: form.validUntil ? new Date(`${form.validUntil}T23:59:00`) : null,
        responsibleProfessionalId: form.professionalId === 'none' ? null : form.professionalId,
        notes: form.notes || null,
        initialFormTemplateId: form.initialTemplateId === 'none' ? null : form.initialTemplateId,
        sessionFormTemplateId: form.sessionTemplateId === 'none' ? null : form.sessionTemplateId,
        requireSignature: form.requireSignature,
        payment:
          toBill === 0
            ? { kind: 'later' }
            : payment === 'full'
              ? { kind: 'full', method }
              : payment === 'partial'
                ? { kind: 'partial', amount: parseMoneyInput(partial), method }
                : { kind: payment },
        opening: opening
          ? { sessionsDone: Number(openingDone) || 0, paidAmount: paidBefore }
          : null,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Pacote cadastrado.');
      invalidate();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid =
    form.name.trim() && form.serviceId && Number(form.sessions) >= 1 && form.contractedAt;

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Novo pacote</DialogTitle>
          <DialogDescription>Sessões contratadas, condições e como foi pago.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          {(options?.plans.length ?? 0) > 0 && (
            <Labeled label="A partir de um plano (opcional)">
              <Select value={form.planId} onValueChange={pickPlan}>
                <SelectTrigger className="w-full" aria-label="Plano">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pacote personalizado</SelectItem>
                  {options!.plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.sessions} sessões · {formatCurrencyBRL(p.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labeled>
          )}
          <Labeled label="Nome do pacote ou tratamento" htmlFor="pkg-name">
            <Input
              id="pkg-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={120}
            />
          </Labeled>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Serviço">
              <Select value={form.serviceId} onValueChange={(v: string) => set('serviceId', v)}>
                <SelectTrigger className="w-full" aria-label="Serviço">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {(options?.services ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labeled>
            <Labeled label="Sessões" htmlFor="pkg-sessions">
              <Input
                id="pkg-sessions"
                inputMode="numeric"
                value={form.sessions}
                onChange={(e) => set('sessions', e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
            </Labeled>
            <Labeled label="Valor total (R$)" htmlFor="pkg-price">
              <Input
                id="pkg-price"
                inputMode="numeric"
                value={form.price}
                placeholder="0,00"
                onChange={(e) => set('price', maskMoneyInput(e.target.value))}
              />
            </Labeled>
            <Labeled label="Data da contratação" htmlFor="pkg-date">
              <Input
                id="pkg-date"
                type="date"
                value={form.contractedAt}
                onChange={(e) => set('contractedAt', e.target.value)}
              />
            </Labeled>
            <Labeled label="Validade (opcional)" htmlFor="pkg-valid">
              <Input
                id="pkg-valid"
                type="date"
                value={form.validUntil}
                onChange={(e) => set('validUntil', e.target.value)}
              />
            </Labeled>
            <Labeled label="Profissional responsável">
              <Select
                value={form.professionalId}
                onValueChange={(v: string) => set('professionalId', v)}
              >
                <SelectTrigger className="w-full" aria-label="Profissional responsável">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {(options?.professionals ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Labeled>
            <Labeled label="Ficha inicial">
              <TemplateSelect
                value={form.initialTemplateId}
                onChange={(v) => set('initialTemplateId', v)}
                templates={options?.templates ?? []}
              />
            </Labeled>
            <Labeled label="Formulário de cada sessão">
              <TemplateSelect
                value={form.sessionTemplateId}
                onChange={(v) => set('sessionTemplateId', v)}
                templates={options?.templates ?? []}
              />
            </Labeled>
          </div>
          <label className="flex items-center justify-between gap-3 text-[14px]">
            Exigir assinatura do cliente em cada sessão
            <Switch
              checked={form.requireSignature}
              onCheckedChange={(v: boolean) => set('requireSignature', v)}
            />
          </label>
          <Labeled label="Observações" htmlFor="pkg-notes">
            <Textarea
              id="pkg-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              maxLength={2000}
            />
          </Labeled>

          {options?.isAdmin && (
            <div className="bg-foreground/[0.03] flex flex-col gap-3 rounded-xl p-3">
              <label className="flex items-center justify-between gap-3 text-[14px] font-medium">
                Pacote contratado antes do sistema (saldo inicial)
                <Switch checked={opening} onCheckedChange={(v: boolean) => setOpening(v)} />
              </label>
              {opening && (
                <>
                  <p className="text-label-secondary text-[12px]">
                    Informe só o saldo: nenhuma data, atendimento ou assinatura antiga é criada.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Labeled label="Sessões já realizadas" htmlFor="pkg-done">
                      <Input
                        id="pkg-done"
                        inputMode="numeric"
                        value={openingDone}
                        onChange={(e) =>
                          setOpeningDone(e.target.value.replace(/\D/g, '').slice(0, 3))
                        }
                      />
                    </Labeled>
                    <Labeled label="Valor já pago (R$)" htmlFor="pkg-paid">
                      <Input
                        id="pkg-paid"
                        inputMode="numeric"
                        value={openingPaid}
                        placeholder="0,00"
                        onChange={(e) => setOpeningPaid(maskMoneyInput(e.target.value))}
                      />
                    </Labeled>
                  </div>
                </>
              )}
            </div>
          )}

          {toBill > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[14px] font-medium">
                {opening
                  ? `Restante (${formatCurrencyBRL(toBill)})`
                  : `Pagamento (${formatCurrencyBRL(toBill)})`}
              </span>
              <SegmentedControl
                size="sm"
                value={payment}
                onValueChange={setPayment}
                options={[
                  { value: 'full', label: 'Pago' },
                  { value: 'partial', label: 'Parte agora' },
                  { value: 'tab', label: 'Fiado' },
                  { value: 'later', label: 'Lançar depois' },
                ]}
              />
              {(payment === 'full' || payment === 'partial') && (
                <MethodPicker value={method} onChange={setMethod} />
              )}
              {payment === 'partial' && (
                <Labeled label="Valor pago agora (o resto vai para o fiado)" htmlFor="pkg-partial">
                  <Input
                    id="pkg-partial"
                    inputMode="numeric"
                    value={partial}
                    placeholder="0,00"
                    onChange={(e) => setPartial(maskMoneyInput(e.target.value))}
                  />
                </Labeled>
              )}
              {payment === 'later' && (
                <p className="text-label-secondary text-[12px]">
                  O valor fica como “a receber” no pacote, sem lançamento no caixa.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Voltar
            </Button>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending ? 'Salvando…' : 'Cadastrar pacote'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplateSelect({
  value,
  onChange,
  templates,
}: {
  value: string;
  onChange: (v: string) => void;
  templates: { id: string; name: string; type: keyof typeof FORM_TYPE_LABEL }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Nenhum</SelectItem>
        {templates.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name} · {FORM_TYPE_LABEL[t.type]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Labeled({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[13px] font-medium">
          {label}
        </label>
      ) : (
        <span className="text-[13px] font-medium">{label}</span>
      )}
      {children}
    </div>
  );
}

function ReceiveDialog({
  pkg,
  clientId,
  onClose,
}: {
  pkg: Pkg;
  clientId: string;
  onClose: () => void;
}) {
  const invalidate = useInvalidate(clientId);
  const [amount, setAmount] = React.useState(
    maskMoneyInput(String(Math.round(pkg.financial.unbilled * 100))),
  );
  const [method, setMethod] = React.useState<Method>('PIX');
  const receive = useMutation({
    mutationFn: () =>
      receivePackagePaymentAction({
        clientPackageId: pkg.id,
        amount: parseMoneyInput(amount),
        method,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Pagamento lançado no caixa.');
      invalidate();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <SmallDialog
      title="Receber pagamento"
      description={`Falta receber ${formatCurrencyBRL(pkg.financial.unbilled)}.`}
      onClose={onClose}
      action={
        <Button
          disabled={receive.isPending || parseMoneyInput(amount) <= 0}
          onClick={() => receive.mutate()}
        >
          Receber
        </Button>
      }
    >
      <Labeled label="Valor (R$)" htmlFor="rcv-amount">
        <Input
          id="rcv-amount"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(maskMoneyInput(e.target.value))}
        />
      </Labeled>
      <MethodPicker value={method} onChange={setMethod} />
    </SmallDialog>
  );
}

function ExtendDialog({
  pkg,
  clientId,
  onClose,
}: {
  pkg: Pkg;
  clientId: string;
  onClose: () => void;
}) {
  const invalidate = useInvalidate(clientId);
  const [sessions, setSessions] = React.useState('1');
  const [price, setPrice] = React.useState('');
  const [reason, setReason] = React.useState('');
  const extend = useMutation({
    mutationFn: () =>
      extendPackageAction({
        clientPackageId: pkg.id,
        sessions: Number(sessions),
        extraPrice: parseMoneyInput(price),
        reason,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Pacote ampliado.');
      invalidate();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <SmallDialog
      title="Ampliar pacote"
      description="Sessões extras entram no pacote com o motivo registrado."
      onClose={onClose}
      action={
        <Button
          disabled={extend.isPending || !Number(sessions) || reason.trim().length < 3}
          onClick={() => extend.mutate()}
        >
          Ampliar
        </Button>
      }
    >
      <Labeled label="Sessões a mais" htmlFor="ext-sessions">
        <Input
          id="ext-sessions"
          inputMode="numeric"
          value={sessions}
          onChange={(e) => setSessions(e.target.value.replace(/\D/g, '').slice(0, 3))}
        />
      </Labeled>
      <Labeled label="Valor adicional (R$, opcional)" htmlFor="ext-price">
        <Input
          id="ext-price"
          inputMode="numeric"
          value={price}
          placeholder="0,00"
          onChange={(e) => setPrice(maskMoneyInput(e.target.value))}
        />
      </Labeled>
      <Labeled label="Motivo" htmlFor="ext-reason">
        <Input id="ext-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Labeled>
    </SmallDialog>
  );
}

function AdjustDialog({
  pkg,
  clientId,
  onClose,
}: {
  pkg: Pkg;
  clientId: string;
  onClose: () => void;
}) {
  const invalidate = useInvalidate(clientId);
  const [delta, setDelta] = React.useState('1');
  const [direction, setDirection] = React.useState<'add' | 'remove'>('add');
  const [reason, setReason] = React.useState('');
  const adjust = useMutation({
    mutationFn: () =>
      adjustPackageAction({
        clientPackageId: pkg.id,
        delta: (direction === 'add' ? 1 : -1) * Number(delta),
        reason,
      }).then(unwrapResult),
    onSuccess: () => {
      toast.success('Saldo corrigido.');
      invalidate();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <SmallDialog
      title="Corrigir saldo"
      description="A correção fica no histórico do pacote, com o motivo."
      onClose={onClose}
      action={
        <Button
          disabled={adjust.isPending || !Number(delta) || reason.trim().length < 3}
          onClick={() => adjust.mutate()}
        >
          Corrigir
        </Button>
      }
    >
      <SegmentedControl
        size="sm"
        value={direction}
        onValueChange={setDirection}
        options={[
          { value: 'add', label: 'Somar realizadas' },
          { value: 'remove', label: 'Tirar realizadas' },
        ]}
      />
      <Labeled label="Quantidade" htmlFor="adj-delta">
        <Input
          id="adj-delta"
          inputMode="numeric"
          value={delta}
          onChange={(e) => setDelta(e.target.value.replace(/\D/g, '').slice(0, 3))}
        />
      </Labeled>
      <Labeled label="Motivo" htmlFor="adj-reason">
        <Input id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Labeled>
    </SmallDialog>
  );
}

function SmallDialog({
  title,
  description,
  onClose,
  action,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">{children}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          {action}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
