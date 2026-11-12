'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { GiftIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { unwrapResult } from '@/lib/action-result';
import { claimTrialAction } from '@/server/actions/trial-actions';

/**
 * Conta nova: libera o 1º mês grátis depois de conferir CPF/CNPJ e celular (um teste por pessoa).
 * Aparece no primeiro acesso e na tela de assinatura enquanto não foi liberado.
 */
export function TrialClaimCard() {
  const router = useRouter();
  const [document, setDocument] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [denied, setDenied] = React.useState<string | null>(null);

  const claim = useMutation({
    mutationFn: () => claimTrialAction({ document, phone }).then(unwrapResult),
    onSuccess: (result) => {
      if (result.granted) {
        toast.success(
          `1º mês grátis liberado até ${new Intl.DateTimeFormat('pt-BR').format(new Date(result.trialEndsAt))}.`,
        );
        setDenied(null);
      } else {
        setDenied(result.reason);
      }
      router.refresh();
    },
    onError: (e: Error) => setDenied(e.message),
  });

  return (
    <section className="bg-system-blue/[0.06] ring-system-blue/20 flex flex-col gap-3 rounded-2xl p-5 ring-1">
      <div className="flex items-start gap-3">
        <GiftIcon className="text-system-blue mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="flex flex-col gap-1">
          <h2 className="text-[17px] font-semibold">Libere o seu 1º mês grátis</h2>
          <p className="text-label-secondary text-[13px] leading-snug">
            O teste grátis é um por pessoa. Informe o CPF ou CNPJ do negócio e um celular para
            liberar 30 dias sem pagar nada. Depois, a assinatura é mensal.
          </p>
        </div>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setDenied(null);
          claim.mutate();
        }}
      >
        <Input
          inputMode="numeric"
          placeholder="CPF ou CNPJ"
          aria-label="CPF ou CNPJ"
          value={document}
          onChange={(e) => setDocument(e.target.value)}
          required
        />
        <Input
          type="tel"
          inputMode="tel"
          placeholder="Celular com DDD"
          aria-label="Celular com DDD"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <Button type="submit" disabled={claim.isPending} className="shrink-0">
          {claim.isPending ? 'Conferindo...' : 'Liberar'}
        </Button>
      </form>
      {denied && <p className="text-destructive text-[13px]">{denied}</p>}
      <p className="text-label-secondary text-[11px]">
        Os dados servem só para conferir se o teste já foi usado e ficam guardados de forma
        irreversível (hash).
      </p>
    </section>
  );
}
