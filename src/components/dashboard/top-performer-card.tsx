import { formatCurrencyBRL } from '@/lib/serialize';
import type { TopPerformer } from '@/server/data/dashboard';

export function TopPerformerCard({
  label,
  performer,
  countLabel,
}: {
  label: string;
  performer: TopPerformer | null;
  countLabel: string;
}) {
  if (!performer) {
    return (
      <div className="rounded-lg border p-4">
        <div className="text-muted-foreground text-sm">{label}</div>
        <div className="text-muted-foreground mt-3 text-sm">Sem dados nos últimos 30 dias.</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: performer.color }}
        />
        <span className="truncate text-lg font-semibold">{performer.name}</span>
      </div>
      <div className="text-muted-foreground mt-1 text-xs">
        {formatCurrencyBRL(performer.revenue)} · {performer.count} {countLabel}
      </div>
    </div>
  );
}
