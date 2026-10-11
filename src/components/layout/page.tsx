import { cn } from '@/lib/utils';

/** Large-title page header shared by every section of the app. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 flex flex-wrap items-end justify-between gap-4 duration-500">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em] md:text-[34px]">
          {title}
        </h1>
        {description && <p className="text-label-secondary mt-1 text-[15px]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Borderless Apple-style surface for tables and grouped content. */
export function Surface({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('bg-tile overflow-hidden rounded-[22px]', className)} {...props} />;
}
