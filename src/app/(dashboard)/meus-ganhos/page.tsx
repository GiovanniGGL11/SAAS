import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getViewerScope } from '@/server/auth/professional-scope';
import { getMyEarnings } from '@/server/data/my-earnings';
import { resolveReportRange } from '@/lib/report-range';
import { formatCurrencyBRL } from '@/lib/serialize';
import { cn } from '@/lib/utils';
import { PageHeader, Surface } from '@/components/layout/page';
import { EarningsTiles } from '@/components/ganhos/earnings-tiles';

export const metadata = { title: 'Meus ganhos' };

const PERIODS = [
  { value: 'thisMonth', label: 'Este mês' },
  { value: 'lastMonth', label: 'Mês passado' },
] as const;
type Period = (typeof PERIODS)[number]['value'];

/** Tela do profissional: atendimentos, produção e comissão dele. */
export default async function MeusGanhosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { session, professional } = await getViewerScope();
  // Dono e recepção acompanham as comissões de todos no Financeiro.
  if (!professional) redirect('/dashboard');
  const { company } = session;
  const { periodo } = await searchParams;
  const period: Period = periodo === 'lastMonth' ? 'lastMonth' : 'thisMonth';
  const range = resolveReportRange(period, company.timezone);
  const earnings = await getMyEarnings(company.id, professional.id, range);

  const dateFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: company.timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Meus ganhos"
        description={`${professional.name} · ${PERIODS.find((p) => p.value === period)!.label.toLowerCase()}`}
      />

      <div className="bg-foreground/[0.06] flex self-start rounded-[18px] p-0.5">
        {PERIODS.map((p) => (
          <Link
            key={p.value}
            href={p.value === 'thisMonth' ? '/meus-ganhos' : `/meus-ganhos?periodo=${p.value}`}
            replace
            scroll={false}
            className={cn(
              'h-8 rounded-full px-4 text-[13px] leading-8 font-medium transition-colors',
              p.value === period
                ? 'bg-background text-foreground shadow-[0_1px_4px_rgb(0_0_0/0.12)] dark:bg-white/15'
                : 'text-label-secondary hover:text-foreground',
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <EarningsTiles
        appointments={earnings.appointments}
        upcoming={earnings.upcoming}
        production={earnings.production}
        commission={earnings.commission}
        rule={earnings.rule}
        openAdvances={earnings.openAdvances}
        toReceive={earnings.toReceive}
        payout={
          earnings.payout
            ? {
                netAmount: earnings.payout.netAmount,
                paidOn: new Intl.DateTimeFormat('pt-BR', { timeZone: company.timezone }).format(
                  earnings.payout.createdAt,
                ),
              }
            : null
        }
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-[20px] font-bold tracking-[-0.02em]">Atendimentos concluídos</h2>
        <Surface>
          {earnings.done.length === 0 ? (
            <p className="text-label-secondary p-5 text-[14px]">
              Nenhum atendimento concluído neste período ainda.
            </p>
          ) : (
            <ul className="divide-foreground/[0.06] divide-y">
              {earnings.done.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{a.clientName}</div>
                    <div className="text-label-secondary truncate text-[13px]">
                      {a.serviceName} · {dateFmt.format(a.startAt)}
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums">{formatCurrencyBRL(a.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </Surface>
        <p className="text-label-secondary text-[12px]">
          A comissão é calculada sobre o que foi cobrado de cada serviço, com descontos e sem
          gorjetas e produtos. O valor final é confirmado no acerto com o responsável.
        </p>
      </section>
    </div>
  );
}
