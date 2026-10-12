import { CheckIcon, GiftIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatCurrencyBRL } from '@/lib/serialize';
import {
  describeReward,
  describeRule,
  formatLoyaltyAmount,
  rewardThreshold,
  type LoyaltyRules,
} from '@/lib/loyalty';

const MODE_LABEL: Record<LoyaltyRules['mode'], string> = {
  STAMPS: 'Cartão de selos',
  POINTS: 'Pontos',
  CASHBACK: 'Cashback',
};

/** Above this many stamps a dot grid gets unreadable — fall back to a bar. */
const MAX_STAMP_DOTS = 20;

/** Wallet-pass style card showing a client's progress (or a sample, as a preview). */
export function LoyaltyCard({
  rules,
  balance,
  holder,
  className,
}: {
  rules: LoyaltyRules;
  balance: number;
  holder: string;
  className?: string;
}) {
  const threshold = rewardThreshold(rules);
  const rewardsAvailable = threshold ? Math.floor(balance / threshold) : 0;

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-[22px] p-5 text-white shadow-[0_20px_40px_-24px_rgb(0_0_0/0.5)]',
        className,
      )}
      style={{ background: 'linear-gradient(135deg, #0a63ff 0%, #1d8bff 55%, #2bc0ff 100%)' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-white/15 blur-2xl"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium tracking-wide text-white/70 uppercase">
            {MODE_LABEL[rules.mode]}
          </div>
          <div className="truncate text-[17px] font-semibold tracking-tight">{holder}</div>
        </div>
        {rewardsAvailable > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-[#0a63ff]">
            <GiftIcon className="size-3.5" />
            {rewardsAvailable === 1 ? 'Recompensa liberada' : `${rewardsAvailable} recompensas`}
          </span>
        )}
      </div>

      <div className="relative mt-5">
        {rules.mode === 'CASHBACK' ? (
          <div>
            <div className="text-[40px] leading-none font-bold tracking-[-0.03em] tabular-nums">
              {formatCurrencyBRL(balance)}
            </div>
            <div className="mt-1.5 text-[13px] text-white/80">de saldo para usar em descontos</div>
          </div>
        ) : rules.mode === 'STAMPS' && threshold && threshold <= MAX_STAMP_DOTS ? (
          <StampGrid filled={Math.min(balance, threshold)} total={threshold} />
        ) : (
          <ProgressToReward rules={rules} balance={balance} threshold={threshold ?? 1} />
        )}
      </div>

      <div className="relative mt-5 border-t border-dashed border-white/35 pt-3 text-[12px] text-white/85">
        {describeRule(rules)}
      </div>
    </div>
  );
}

function StampGrid({ filled, total }: { filled: number; total: number }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'flex aspect-square items-center justify-center rounded-full',
              i < filled ? 'bg-white text-[#0a63ff]' : 'border-2 border-dashed border-white/45',
            )}
          >
            {i < filled && <CheckIcon className="size-[55%]" strokeWidth={3} />}
          </span>
        ))}
      </div>
      <div className="mt-3 text-[13px] text-white/85 tabular-nums">
        {filled} de {total} selos
      </div>
    </div>
  );
}

function ProgressToReward({
  rules,
  balance,
  threshold,
}: {
  rules: LoyaltyRules;
  balance: number;
  threshold: number;
}) {
  const progress = Math.min(balance / threshold, 1);
  const missing = Math.max(threshold - balance, 0);

  return (
    <div>
      <div className="text-[40px] leading-none font-bold tracking-[-0.03em] tabular-nums">
        {formatLoyaltyAmount(rules.mode, balance)}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/25">
        <div className="h-full rounded-full bg-white" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="mt-2 text-[13px] text-white/85">
        {missing > 0
          ? `Faltam ${formatLoyaltyAmount(rules.mode, missing)} para: ${describeReward(rules)}`
          : describeReward(rules)}
      </div>
    </div>
  );
}
