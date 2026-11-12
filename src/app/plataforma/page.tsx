import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';

import { cn } from '@/lib/utils';
import { formatCurrencyBRL } from '@/lib/serialize';
import { getPlan } from '@/lib/billing/plans';
import {
  SITUATION_LABEL,
  getPlatformCompanies,
  getPlatformRevenue,
  getPlatformUsers,
  isPlatformAdmin,
  summarizeCompanies,
  type CompanySituation,
} from '@/server/platform/overview';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plataforma', robots: { index: false, follow: false } };

const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' });
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

const SITUATION_COLOR: Record<CompanySituation, string> = {
  paying: 'text-system-green',
  past_due: 'text-[#ff9f0a]',
  canceled: 'text-label-secondary',
  trial: 'text-system-blue',
  trial_pending: 'text-system-indigo',
  trial_ended: 'text-destructive',
};

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-tile flex flex-col gap-1 rounded-[22px] p-5">
      <span className="text-label-secondary text-[13px]">{label}</span>
      <span className="text-[26px] font-semibold tracking-tight tabular-nums">{value}</span>
      {hint && <span className="text-label-secondary text-[12px]">{hint}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="bg-tile overflow-x-auto rounded-[22px]">
      <table className="w-full text-left text-[13px]">
        <thead className="text-label-secondary">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-foreground/[0.06] divide-y">{children}</tbody>
      </table>
    </div>
  );
}

const td = 'px-4 py-2.5 whitespace-nowrap';

/** Painel do dono do Atendafy: empresas, testes, assinaturas e faturamento. Só para quem está em PLATFORM_ADMIN_USER_IDS. */
export default async function PlataformaPage() {
  const { userId } = await auth();
  if (!isPlatformAdmin(userId)) notFound();

  const now = new Date();
  const [companies, revenue, users] = await Promise.all([
    getPlatformCompanies(now),
    getPlatformRevenue(now),
    getPlatformUsers(),
  ]);
  const summary = summarizeCompanies(companies, now);
  const money = formatCurrencyBRL;

  return (
    <main className="font-apple mx-auto flex w-full max-w-7xl flex-col gap-8 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.03em]">Plataforma</h1>
          <p className="text-label-secondary text-[14px]">
            Visão do Atendafy inteiro. Só você vê esta página. Atualizado em {dateTime.format(now)}.
          </p>
        </div>
        <Link href="/dashboard" className="text-system-blue text-[14px] font-medium">
          Voltar ao painel →
        </Link>
      </header>

      <Section title="Faturamento">
        {revenue ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile
              label="Receita recorrente (MRR)"
              value={money(summary.mrr)}
              hint="Soma dos planos de quem paga"
            />
            <Tile
              label="Recebido no mês"
              value={money(revenue.thisMonth.gross)}
              hint={`${revenue.thisMonth.count} pagamento(s) · líquido ${money(revenue.thisMonth.net)}`}
            />
            <Tile
              label="Mês passado"
              value={money(revenue.lastMonth.gross)}
              hint={`${revenue.lastMonth.count} pagamento(s)`}
            />
            <Tile
              label="A receber"
              value={money(revenue.pending.total)}
              hint={`${revenue.pending.count} cobrança(s) em aberto`}
            />
            <Tile
              label="Atrasado"
              value={money(revenue.overdue.total)}
              hint={`${revenue.overdue.count} cobrança(s) vencida(s)`}
            />
            <Tile
              label="Saldo na Asaas"
              value={money(revenue.balance)}
              hint="Disponível para saque"
            />
          </div>
        ) : (
          <p className="bg-tile text-label-secondary rounded-[22px] p-5 text-[14px]">
            Não foi possível consultar a Asaas agora (ou a chave não está configurada). A receita
            recorrente estimada é {money(summary.mrr)}.
          </p>
        )}
      </Section>

      <Section title="Empresas">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <Tile
            label="Total"
            value={String(summary.total)}
            hint={`+${summary.newLast7} em 7 dias · +${summary.newLast30} em 30`}
          />
          {(Object.keys(SITUATION_LABEL) as CompanySituation[]).map((s) => (
            <Tile key={s} label={SITUATION_LABEL[s]} value={String(summary.counts[s])} />
          ))}
          <Tile
            label="Conversão"
            value={
              summary.total
                ? `${Math.round(((summary.counts.paying + summary.counts.past_due) / summary.total) * 100)}%`
                : '—'
            }
            hint="Empresas que assinam"
          />
        </div>
      </Section>

      <Section title={`Testes que acabam em até 7 dias (${summary.endingSoon.length})`}>
        {summary.endingSoon.length ? (
          <Table head={['Empresa', 'Criada em', 'Faltam', 'Fim do teste']}>
            {summary.endingSoon.map((c) => (
              <tr key={c.id}>
                <td className={td}>{c.name}</td>
                <td className={td}>{date.format(c.createdAt)}</td>
                <td className={td}>
                  {c.daysLeft} {c.daysLeft === 1 ? 'dia' : 'dias'}
                </td>
                <td className={td}>{c.trialEndsAt ? date.format(c.trialEndsAt) : '—'}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-label-secondary text-[14px]">
            Nenhum teste acabando nos próximos 7 dias.
          </p>
        )}
      </Section>

      <Section title={`Usuários${users ? ` (${users.total} contas)` : ''}`}>
        {users ? (
          <Table head={['Nome', 'E-mail', 'Cadastro', 'Último acesso']}>
            {users.latest.map((u) => (
              <tr key={u.id}>
                <td className={td}>{u.name ?? '—'}</td>
                <td className={td}>{u.email ?? '—'}</td>
                <td className={td}>{dateTime.format(u.createdAt)}</td>
                <td className={td}>{u.lastSignInAt ? dateTime.format(u.lastSignInAt) : '—'}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-label-secondary text-[14px]">
            Não foi possível consultar o Clerk agora.
          </p>
        )}
      </Section>

      <Section title={`Todas as empresas (${companies.length})`}>
        <Table
          head={[
            'Empresa',
            'Criada em',
            'Situação',
            'Plano',
            'Teste / período até',
            'Clientes',
            'Atendimentos (30 dias)',
          ]}
        >
          {companies.map((c) => {
            const until =
              c.situation === 'paying' || c.situation === 'past_due' || c.situation === 'canceled'
                ? c.currentPeriodEnd
                : c.situation === 'trial_pending'
                  ? null
                  : c.trialEndsAt;
            return (
              <tr key={c.id}>
                <td className={td}>{c.name}</td>
                <td className={td}>{date.format(c.createdAt)}</td>
                <td className={cn(td, 'font-medium', SITUATION_COLOR[c.situation])}>
                  {SITUATION_LABEL[c.situation]}
                </td>
                <td className={td}>{getPlan(c.plan)?.name ?? '—'}</td>
                <td className={td}>{until ? date.format(until) : '—'}</td>
                <td className={cn(td, 'tabular-nums')}>{c.clients}</td>
                <td className={cn(td, 'tabular-nums')}>{c.appointments30d}</td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </main>
  );
}
