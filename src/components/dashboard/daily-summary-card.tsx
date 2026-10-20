import Link from 'next/link';
import { ChevronRightIcon, SunIcon } from 'lucide-react';

/** Atalho para "Meu dia" (Atividades): o que precisa de atenção hoje, de todos os módulos. */
export function DailySummaryCard() {
  return (
    <Link
      href="/atividades"
      className="bg-tile hover:bg-foreground/[0.04] flex items-center gap-3 rounded-[22px] px-5 py-4 transition-colors"
    >
      <span className="bg-system-orange/12 text-system-orange flex size-10 items-center justify-center rounded-full">
        <SunIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold">Meu dia</span>
        <span className="text-label-secondary block text-[13px]">
          Atendimentos, tarefas, retornos, orçamentos e contas que pedem atenção.
        </span>
      </span>
      <ChevronRightIcon className="text-label-secondary size-4" />
    </Link>
  );
}
