import type { LucideIcon } from 'lucide-react';
import { InboxIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 py-14 text-center',
        className,
      )}
    >
      <div className="bg-primary/10 text-primary mb-2 flex size-12 items-center justify-center rounded-2xl">
        <Icon className="size-5" />
      </div>
      <p className="text-foreground text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
      {description && (
        <p className="text-label-secondary max-w-xs text-[13px] whitespace-normal">{description}</p>
      )}
    </div>
  );
}
