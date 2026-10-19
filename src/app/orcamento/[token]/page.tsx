import type { Metadata } from 'next';
import { FileWarningIcon } from 'lucide-react';

import { getQuoteByToken } from '@/server/data/quotes';
import { rateLimit } from '@/server/rate-limit';
import { UserError } from '@/server/errors';
import { PublicQuote } from '@/components/orcamentos/public-quote';

export const dynamic = 'force-dynamic';

// Link individual: fora de buscadores, sem cache e sem vazar o endereço por Referer.
export const metadata: Metadata = {
  title: 'Orçamento',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

const PROBLEMS = {
  invalid: { title: 'Link inválido', text: 'Confira se o endereço foi copiado inteiro.' },
  expired: { title: 'Link expirado', text: 'Peça um link novo para a empresa.' },
  revoked: {
    title: 'Link substituído',
    text: 'O orçamento mudou ou o link foi desativado. Peça o link atualizado para a empresa.',
  },
} as const;

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <main className="font-apple bg-tile flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <FileWarningIcon className="text-label-secondary size-10" />
      <h1 className="text-[22px] font-semibold">{title}</h1>
      <p className="text-label-secondary max-w-sm text-[15px]">{text}</p>
    </main>
  );
}

/** Orçamento para o cliente: só ele, sem custo, comissão ou nota interna. */
export default async function OrcamentoPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  try {
    await rateLimit('quote-view', 40, 60_000);
  } catch (error) {
    if (error instanceof UserError)
      return <Problem title="Muitas tentativas" text={error.message} />;
    throw error;
  }
  const result = await getQuoteByToken(token);
  if ('problem' in result) return <Problem {...PROBLEMS[result.problem]} />;
  return <PublicQuote token={token} quote={result.quote} />;
}
