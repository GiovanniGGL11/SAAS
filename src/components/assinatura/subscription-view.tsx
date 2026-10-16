'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CheckIcon } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { unwrapResult } from '@/lib/action-result';
import { formatCurrencyBRL } from '@/lib/serialize';
import { ADD_ONS, PLANS, getPlan, planPrice, type PlanId } from '@/lib/billing/plans';
import { cn } from '@/lib/utils';
import type { SubscriptionState } from '@/server/billing/subscription';
import {
  cancelSubscriptionAction,
  getInvoiceUrlAction,
  startSubscriptionAction,
} from '@/server/actions/billing-actions';

type State = SubscriptionState & { hasSubscription: boolean };

const STATUS: Record<string, string> = {
  TRIAL: 'Período de teste',
  ACTIVE: 'Assinatura ativa',
  PAST_DUE: 'Pagamento atrasado',
  CANCELED: 'Assinatura cancelada',
};

/** Planos do Atendafy, teste grátis e pagamento pela Asaas (PIX, boleto ou cartão). */
export function SubscriptionView({ state, companyName }: { state: State; companyName: string }) {
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

      <section className="bg-tile flex flex-wrap items-center justify-between gap-4 rounded-[22px] p-5">
        <div>
          <div className="text-label-secondary text-[13px]">{STATUS[state.status]}</div>
          <div className="text-[20px] font-semibold">
            {state.status === 'TRIAL'
              ? state.trialDaysLeft > 0
                ? `${state.trialDaysLeft} ${state.trialDaysLeft === 1 ? 'dia' : 'dias'} de teste grátis`
                : 'O teste grátis terminou'
              : current
                ? `Plano ${current.name}${current.legacy ? ' (plano anterior)' : ''} · ${formatCurrencyBRL(planPrice(current))}/mês`
                : '—'}
          </div>
          <div className="text-label-secondary text-[13px]">
            {state.status === 'TRIAL' &&
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

      {(!state.hasSubscription || state.status === 'CANCELED') && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
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
                  {plan.id === 'profissional' && (
                    <span className="bg-system-blue rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">
                      Mais escolhido
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[28px] font-bold tracking-tight">
                    {formatCurrencyBRL(planPrice(plan))}
                  </span>
                  <span className="text-label-secondary text-[14px]">/mês</span>
                </div>
                <div
                  className={cn(
                    'rounded-xl px-3 py-2 text-[13px]',
                    plan.ai.assistant
                      ? 'bg-system-blue/[0.07]'
                      : 'bg-foreground/[0.04] text-label-secondary',
                  )}
                >
                  {!plan.ai.assistant
                    ? 'Sem inteligência artificial.'
                    : plan.ai.autoExecution
                      ? 'Assistente de IA com franquia maior. Automações e execução automática autorizada: em preparação.'
                      : 'Assistente de IA por texto: consulta e prepara alterações que só valem com a sua aprovação.'}
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
              Os planos com IA têm franquia mensal de uso; ao atingir o limite, a IA pausa até o mês
              seguinte e o restante do sistema continua funcionando. Nada é cobrado além do plano
              sem contratação.
            </p>
            <p>
              Comandos de voz e automações com IA estão em preparação e serão liberados nos planos
              com IA quando estiverem prontos.
            </p>
            {ADD_ONS.map((addOn) => (
              <p key={addOn.id}>
                Adicional em preparação: {addOn.name} (planos com IA; preço e limites a definir).
              </p>
            ))}
          </div>

          {state.configured && (
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
