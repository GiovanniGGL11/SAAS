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
        'flex flex-col items-center justify-center gap-1.5 py-10 text-center',
        className,
      )}
    >
      <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-full">
        <Icon className="size-4" />
      </div>
      <p className="text-foreground text-sm font-medium">{title}</p>
      {description && <p className="text-muted-foreground text-xs">{description}</p>}
    </div>
  );
}
