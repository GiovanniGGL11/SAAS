'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { UsersRoundIcon } from 'lucide-react';

import { Surface } from '@/components/layout/page';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrencyBRL } from '@/lib/serialize';
import { whatsappLink } from '@/lib/phone';
import { listTopReferrersAction } from '@/server/actions/relationship-actions';
import { ReferralProgram } from '@/components/campanhas/referral-program';
import { usePlanFeatures } from '@/components/plan/use-plan-features';

/** Quem mais trouxe clientes novos — para agradecer e premiar. */
export function ReferralsView() {
  const { data } = useQuery({ queryKey: ['referrers'], queryFn: () => listTopReferrersAction() });
  const program = usePlanFeatures().has('referrals');
  return (
    <div className="flex flex-col gap-4">
      {program && <ReferralProgram />}
      <p className="text-label-secondary max-w-2xl text-[14px]">
        Ao cadastrar um cliente novo, preencha &ldquo;Indicado por&rdquo;. Aqui aparece quem mais
        indica e quanto os indicados já gastaram. Uma boa prática do mercado: dar um cupom de
        agradecimento a cada indicação que vira cliente.
      </p>
      <Surface>
        {!data || data.length === 0 ? (
          <EmptyState
            icon={UsersRoundIcon}
            title="Nenhuma indicação registrada"
            description="Pergunte &ldquo;como conheceu a gente?&rdquo; no primeiro atendimento e marque quem indicou."
          />
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-label-secondary border-foreground/[0.06] border-b text-left text-[12px]">
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-3 py-3 text-right font-medium">Indicou</th>
                <th className="px-3 py-3 text-right font-medium">Gasto dos indicados</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const link = whatsappLink(
                  r.phone,
                  `Oi, ${r.name.split(' ')[0]}! Obrigado por indicar a gente para ${r.count === 1 ? 'um amigo' : 'seus amigos'}. Você é demais! 💙`,
                );
                return (
                  <tr key={r.id} className="border-foreground/[0.06] border-b last:border-0">
                    <td className="px-5 py-3">
                      <Link href={`/clientes/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.count}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrencyBRL(r.revenue)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-system-green text-[13px] font-medium hover:underline"
                        >
                          Agradecer
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Surface>
    </div>
  );
}
