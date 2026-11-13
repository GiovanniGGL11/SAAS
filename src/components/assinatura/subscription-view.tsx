'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CheckIcon, MessageCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { PLANS, getPlan, planPrice, type PlanId } from '@/lib/billing/plans';
import { cn } from '@/lib/utils';
import { TrialClaimCard } from '@/components/assinatura/trial-claim-card';
import { pricePerDay } from '@/lib/billing/upgrade';
import type { TrialUsageItem } from '@/server/billing/trial-usage';
import type { SubscriptionState } from '@/server/billing/subscription';
import {
  cancelSubscriptionAction,
  changePlanAction,
  getInvoiceUrlAction,
  listInvoicesAction,
  startSubscriptionAction,
} from '@/server/actions/billing-actions';

type State = SubscriptionState & { hasSubscription: boolean };

const STATUS: Record<string, string> = {
  TRIAL: 'Período de teste',
  ACTIVE: 'Assinatura ativa',
  PAST_DUE: 'Pagamento atrasado',
  CANCELED: 'Assinatura cancelada',
};

const INVOICE_STATUS: Record<string, string> = {
  PENDING: 'Em aberto',
  OVERDUE: 'Vencida',
  RECEIVED: 'Paga',
  CONFIRMED: 'Paga',
  RECEIVED_IN_CASH: 'Paga',
  REFUNDED: 'Estornada',
  REFUND_REQUESTED: 'Estorno pedido',
  CHARGEBACK_REQUESTED: 'Contestada',
};

/** "cerca de 300": cada pergunta usa de 1 a 6 consultas ao modelo (~3 em média). */
function approxQuestions(units: number | null): number {
  return Math.max(50, Math.floor((units ?? 0) / 3 / 100) * 100);
}

/** O que a IA faz em cada plano, em uma frase sem jargão. */
function aiSummary(plan: (typeof PLANS)[number]): string {
  if (!plan.ai.assistant) return 'Sem assistente de IA.';
  const questions = approxQuestions(plan.ai.monthlyUnits).toLocaleString('pt-BR');
  return plan.ai.autoExecution
    ? `Assistente de IA com mais uso: cerca de ${questions} perguntas por mês. Inclui as rotinas automáticas, que você liga quando quiser.`
    : `Assistente de IA: pergunte sobre agenda, caixa e clientes e peça alterações — nada muda sem a sua aprovação. Cerca de ${questions} perguntas por mês.`;
}

/** Planos do Atendafy, teste grátis e pagamento pela Asaas (PIX, boleto ou cartão). */
export function SubscriptionView({
  state,
  companyName,
  trialUsage = [],
}: {
  state: State;
  companyName: string;
  /** No teste: o que já usou do Profissional (some no Básico). */
  trialUsage?: TrialUsageItem[];
}) {
  const router = useRouter();
  const offered = PLANS.filter((p) => p.offered);
  const [selected, setSelected] = React.useState<PlanId>(() => {
    const currentPlan = getPlan(state.plan);
    return currentPlan?.offered && currentPlan.checkoutEnabled ? currentPlan.id : 'profissional';
  });
  const selectedPlan = getPlan(selected)!;
  const [form, setForm] = React.useState({ name: companyName, cpfCnpj: '', email: '', phone: '' });
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const date = new Intl.DateTimeFormat('pt-BR');
  const current = getPlan(state.plan);

  const start = useMutation({
    mutationFn: () => startSubscriptionAction({ planId: selected, ...form }).then(unwrapResult),
    onSuccess: ({ invoiceUrl, firstDue }) => {
      if (invoiceUrl) window.location.href = invoiceUrl;
      else {
        toast.success(
          `Assinatura criada. A primeira cobrança vence em ${firstDue.split('-').reverse().join('/')}; você recebe o link por e-mail.`,
        );
        router.refresh();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const pay = useMutation({
    mutationFn: () => getInvoiceUrlAction().then(unwrapResult),
    onSuccess: ({ url }) =>
      url ? (window.location.href = url) : toast.info('Nenhuma cobrança em aberto agora.'),
    onError: (e: Error) => toast.error(e.message),
  });
  const active = state.hasSubscription && state.status !== 'CANCELED';
  const invoices = useQuery({
    queryKey: ['billing-invoices'],
    queryFn: () => listInvoicesAction().then(unwrapResult),
    enabled: state.hasSubscription && state.configured,
  });
  const change = useMutation({
    mutationFn: () => changePlanAction({ planId: selected }).then(unwrapResult),
    onSuccess: () => {
      toast.success(`Plano trocado para ${selectedPlan.name}. Vale a partir da próxima cobrança.`);
      invoices.refetch();
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: () => cancelSubscriptionAction().then(unwrapResult),
    onSuccess: () => {
      toast.success('Assinatura cancelada. O acesso continua até o fim do período pago.');
      setCancelOpen(false);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assinatura"
        description="Seu plano do Atendafy, pagamento e período de teste."
      />

      {state.trialPending && !state.courtesyUntil && <TrialClaimCard />}

      {trialUsage.length > 0 && (
        <section className="bg-system-blue/[0.06] ring-system-blue/20 flex flex-col gap-3 rounded-[22px] p-5 ring-1">
          <div>
            <h2 className="text-[17px] font-semibold">No teste, você já usou</h2>
            <p className="text-label-secondary text-[13px]">
              Esses recursos são do plano Profissional. No Básico eles param de funcionar — os dados
              ficam guardados.
            </p>
          </div>
          <ul className="grid gap-1.5 text-[14px] sm:grid-cols-2">
            {trialUsage.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <CheckIcon className="text-system-green size-4 shrink-0" />
                <span>
                  <strong className="tabular-nums">{item.count}</strong> {item.label}
                </span>
              </li>
            ))}
          </ul>
          <Button
            className="self-start"
            onClick={() => {
              setSelected('profissional');
              document.getElementById('planos')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Continuar com o Profissional
          </Button>
        </section>
      )}

      {state.courtesyUntil && state.status !== 'ACTIVE' && (
        <section className="bg-system-indigo/[0.07] ring-system-indigo/20 rounded-[22px] p-5 ring-1">
          <div className="text-[17px] font-semibold">Acesso cortesia</div>
          <p className="text-label-secondary text-[13px]">
            O Atendafy liberou o seu acesso sem cobrança{' '}
            {new Date(state.courtesyUntil).getUTCFullYear() >= 2099
              ? 'por tempo indeterminado'
              : `até ${date.format(new Date(state.courtesyUntil))}`}
            . Você pode assinar quando quiser.
          </p>
        </section>
      )}

      <section className="bg-tile flex flex-wrap items-center justify-between gap-4 rounded-[22px] p-5">
        <div>
          <div className="text-label-secondary text-[13px]">{STATUS[state.status]}</div>
          <div className="text-[20px] font-semibold">
            {state.status === 'TRIAL' && state.trialPending
              ? '1º mês grátis a liberar'
              : state.status === 'TRIAL'
                ? state.trialDaysLeft > 0
                  ? `${state.trialDaysLeft} ${state.trialDaysLeft === 1 ? 'dia' : 'dias'} de teste grátis`
                  : 'O teste grátis terminou'
                : current
                  ? `Plano ${current.name}${current.legacy ? ' (plano anterior)' : ''} · ${formatCurrencyBRL(planPrice(current))}/mês`
                  : '—'}
          </div>
          <div className="text-label-secondary text-[13px]">
            {state.status === 'TRIAL' &&
              !state.trialPending &&
              `Teste até ${date.format(new Date(state.trialEnd))}. Assinando agora, a 1ª cobrança vence no fim do teste.`}
            {state.status !== 'TRIAL' &&
              state.currentPeriodEnd &&
              `Pago até ${date.format(new Date(state.currentPeriodEnd))}.`}
          </div>
        </div>
        {state.hasSubscription && state.status !== 'CANCELED' && (
          <div className="flex gap-2">
            <Button variant="outline" disabled={pay.isPending} onClick={() => pay.mutate()}>
              Pagar cobrança em aberto
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              Cancelar assinatura
            </Button>
          </div>
        )}
      </section>

      {!state.configured && (
        <p className="bg-system-blue/[0.06] rounded-xl px-4 py-3 text-[14px]">
          A cobrança on-line ainda está sendo ativada. Você pode usar tudo durante o teste;
          avisaremos antes de qualquer cobrança.
        </p>
      )}

      {(!state.hasSubscription || active) && (
        <>
          <div id="planos" className="grid scroll-mt-24 gap-4 md:grid-cols-3">
            {offered.map((plan) => (
              <button
                key={plan.id}
                type="button"
                disabled={!plan.checkoutEnabled}
                aria-pressed={selected === plan.id}
                onClick={() => setSelected(plan.id)}
                className={cn(
                  'bg-tile flex flex-col gap-3 rounded-[22px] p-5 text-left ring-2 transition-colors disabled:cursor-default',
                  selected === plan.id
                    ? 'ring-system-blue'
                    : 'hover:ring-foreground/10 ring-transparent',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[17px] font-semibold">{plan.name}</span>
                  {active && plan.id === state.plan ? (
                    <span className="bg-system-green rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">
                      Plano atual
                    </span>
                  ) : (
                    plan.id === 'profissional' && (
                      <span className="bg-system-blue rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">
                        Mais escolhido
                      </span>
                    )
                  )}
                </div>
                <div>
                  <span className="text-[28px] font-bold tracking-tight">
                    {formatCurrencyBRL(planPrice(plan))}
                  </span>
                  <span className="text-label-secondary text-[14px]">/mês</span>
                  <p className="text-label-secondary text-[12px]">
                    ≈ {formatCurrencyBRL(pricePerDay(plan.priceCents))} por dia
                  </p>
                  <p className="text-label-secondary mt-1 text-[13px]">{plan.tagline}</p>
                </div>
                <div
                  className={cn(
                    'rounded-xl px-3 py-2 text-[13px]',
                    plan.ai.assistant
                      ? 'bg-system-blue/[0.07]'
                      : 'bg-foreground/[0.04] text-label-secondary',
                  )}
                >
                  {aiSummary(plan)}
                </div>
                <ul className="flex flex-col gap-1.5 text-[14px]">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <CheckIcon className="text-system-green mt-0.5 size-4 shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
                {!plan.checkoutEnabled && (
                  <p className="text-label-secondary mt-auto text-[12px]">
                    Contratação ainda não disponível.
                  </p>
                )}
              </button>
            ))}
          </div>

          <div className="text-label-secondary flex flex-col gap-1 text-[13px]">
            <p>
              O assistente de IA tem um limite de perguntas por mês. Se acabar, ele volta no mês
              seguinte; o resto do sistema continua normal e nada é cobrado a mais.
            </p>
          </div>

          {/* WhatsApp automático: adicional à parte, cobrado pelo serviço de conexão (não por nós). */}
          <section className="flex flex-col gap-3 rounded-[22px] bg-[#25d366]/[0.07] p-5 ring-1 ring-[#25d366]/25">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-white">
                <MessageCircleIcon className="size-4.5" />
              </span>
              <div>
                <h3 className="text-[16px] font-semibold">
                  Adicional: WhatsApp automático{' '}
                  <span className="text-label-secondary text-[13px] font-normal">
                    · planos Profissional e Pro
                  </span>
                </h3>
                <p className="text-label-secondary text-[13px]">
                  Confirmação ao marcar, lembrete na véspera, pedido de avaliação e parabéns saem
                  sozinhos, do número do seu salão.
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5 text-[13px] leading-snug">
              <li>
                <strong>Como funciona:</strong> você conecta o WhatsApp do salão a um serviço de
                conexão (hoje, a Z-API) e liga as mensagens que quiser em Configurações → WhatsApp.
              </li>
              <li>
                <strong>Quem cobra:</strong> o serviço de conexão cobra direto de você, conforme o
                plano dele. <strong>O Atendafy não cobra nada por isso</strong> e não fica com
                nenhuma parte.
              </li>
              <li>
                <strong>Sem o adicional:</strong> as mensagens continuam prontas — é só tocar no
                botão do WhatsApp e enviar.
              </li>
            </ul>
          </section>

          {active && selected !== state.plan && (
            <Button
              className="self-start"
              disabled={change.isPending || !selectedPlan.checkoutEnabled}
              onClick={() => change.mutate()}
            >
              {change.isPending
                ? 'Trocando...'
                : `Trocar para ${selectedPlan.name} — ${formatCurrencyBRL(planPrice(selectedPlan))}/mês`}
            </Button>
          )}

          {state.configured && !active && (
            <form
              className="bg-tile flex flex-col gap-3 rounded-[22px] p-5"
              onSubmit={(e) => {
                e.preventDefault();
                start.mutate();
              }}
            >
              <h2 className="text-[17px] font-semibold">Dados para a cobrança</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Nome ou razão social"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <Input
                  placeholder="CPF ou CNPJ"
                  inputMode="numeric"
                  value={form.cpfCnpj}
                  onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })}
                />
                <Input
                  type="email"
                  placeholder="E-mail para as faturas"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <Input
                  placeholder="Celular (opcional)"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <p className="text-label-secondary text-[13px]">
                Pagamento pela Asaas: PIX, boleto ou cartão. Cancele quando quiser; o acesso vale
                até o fim do mês pago.
              </p>
              <Button
                type="submit"
                className="self-start"
                disabled={start.isPending || !selectedPlan.checkoutEnabled}
              >
                {start.isPending
                  ? 'Criando assinatura...'
                  : `Assinar ${selectedPlan.name} — ${formatCurrencyBRL(planPrice(selectedPlan))}/mês`}
              </Button>
            </form>
          )}
        </>
      )}

      {state.hasSubscription && (invoices.data?.length ?? 0) > 0 && (
        <section className="bg-tile flex flex-col gap-2 rounded-[22px] p-5">
          <h2 className="text-[17px] font-semibold">Cobranças</h2>
          <ul className="divide-foreground/[0.06] flex flex-col divide-y text-[14px]">
            {invoices.data!.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="w-24">{invoice.dueDate.split('-').reverse().join('/')}</span>
                <span className="w-24 font-medium">{formatCurrencyBRL(invoice.value)}</span>
                <span className="text-label-secondary flex-1">
                  {INVOICE_STATUS[invoice.status] ?? invoice.status}
                </span>
                <a
                  href={invoice.invoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-system-blue"
                >
                  {invoice.status === 'PENDING' || invoice.status === 'OVERDUE'
                    ? 'Pagar'
                    : 'Ver fatura'}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={cancelOpen}
        title="Cancelar a assinatura?"
        description="As próximas cobranças são canceladas. O acesso continua até o fim do período já pago."
        confirmLabel="Cancelar assinatura"
        destructive
        pending={cancel.isPending}
        onConfirm={() => cancel.mutate()}
        onOpenChange={setCancelOpen}
      />
    </div>
  );
}
