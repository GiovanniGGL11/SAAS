import { CheckCircle2Icon, ClockIcon } from 'lucide-react';

import type { FeatureKey } from '@/lib/billing/plans';
import type { FeatureTrialStatus } from '@/lib/billing/feature-trials';
import { FEATURE_TRIAL_DAYS } from '@/lib/billing/feature-trials';
import { FeatureTrialButton } from '@/components/assinatura/feature-trial-button';

const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/** "Teste antes de assinar": cada recurso fora do plano, com o botão de 3 dias grátis. */
export function TrialCatalog({
  items,
}: {
  items: {
    key: FeatureKey;
    name: string;
    planName: string | null;
    status: FeatureTrialStatus;
  }[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="bg-tile flex flex-col gap-3 rounded-[22px] p-5">
      <div>
        <h2 className="text-[17px] font-semibold">Teste antes de assinar</h2>
        <p className="text-label-secondary text-[13px]">
          Cada recurso abaixo pode ser liberado de verdade, com os seus dados, por{' '}
          {FEATURE_TRIAL_DAYS} dias. Uma vez por recurso e sem cobrança. O que você fizer fica
          guardado.
        </p>
      </div>
      <ul className="divide-foreground/[0.06] flex flex-col divide-y">
        {items.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{item.name}</p>
              {item.planName && (
                <p className="text-label-secondary text-[12px]">No plano {item.planName}</p>
              )}
            </div>
            {item.status.state === 'available' && (
              <FeatureTrialButton
                feature={item.key}
                days={FEATURE_TRIAL_DAYS}
                label="Testar grátis"
                className="px-4 py-1.5 text-[13px] shadow-none"
              />
            )}
            {item.status.state === 'active' && (
              <span className="text-system-blue inline-flex items-center gap-1 text-[13px] font-medium">
                <ClockIcon className="size-3.5" /> Em teste até {when(item.status.endsAt)}
              </span>
            )}
            {item.status.state === 'used' && (
              <span className="text-label-secondary inline-flex items-center gap-1 text-[13px]">
                <CheckCircle2Icon className="size-3.5" /> Testado até {when(item.status.endedAt)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
