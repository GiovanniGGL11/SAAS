import { cn } from '@/lib/utils';
import { ENTRY_STATUS_LABEL } from '@/lib/forms/schema';
import { ENTRY_STATUS_TONE } from '@/components/fichas/labels';

type Status = keyof typeof ENTRY_STATUS_LABEL;

/** Status da ficha (o mesmo para quem só acompanha e para quem lê as respostas). */
export function EntryStatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap',
        ENTRY_STATUS_TONE[status],
        className,
      )}
    >
      {ENTRY_STATUS_LABEL[status]}
    </span>
  );
}

export function FlagBadge({
  children,
  tone = 'amber',
}: {
  children: React.ReactNode;
  tone?: 'amber' | 'red';
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap',
        tone === 'amber'
          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
          : 'bg-system-red/12 text-system-red',
      )}
    >
      {children}
    </span>
  );
}
