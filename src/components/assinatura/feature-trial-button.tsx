'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConicalIcon } from 'lucide-react';
import { toast } from 'sonner';

import { unwrapResult } from '@/lib/action-result';
import type { FeatureKey } from '@/lib/billing/plans';
import { cn } from '@/lib/utils';
import { startFeatureTrialAction } from '@/server/actions/plan-actions';

/** "Testar grátis por 3 dias": libera o recurso de verdade e recarrega a tela já liberada. */
export function FeatureTrialButton({
  feature,
  days,
  className,
  label,
}: {
  feature: FeatureKey;
  days: number;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: () => startFeatureTrialAction({ feature }).then(unwrapResult),
    onSuccess: (trial) => {
      const until = new Date(trial.endsAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      toast.success(`Teste liberado até ${until}. Aproveite!`);
      queryClient.invalidateQueries({ queryKey: ['plan-features'] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      disabled={start.isPending}
      onClick={() => start.mutate()}
      className={cn(
        'bg-system-blue inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_-12px_var(--system-blue)] transition-transform hover:scale-[1.03] active:scale-[0.98] disabled:opacity-60',
        className,
      )}
    >
      <FlaskConicalIcon className="size-4" />
      {start.isPending ? 'Liberando...' : (label ?? `Testar grátis por ${days} dias`)}
    </button>
  );
}
