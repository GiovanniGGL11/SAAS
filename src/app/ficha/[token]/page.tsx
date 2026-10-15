import type { Metadata } from 'next';
import { FileWarningIcon } from 'lucide-react';

import { getPublicForm, problemMessage } from '@/server/data/forms';
import { getCompanyLogoUrl } from '@/server/data/public-booking';
import { rateLimit } from '@/server/rate-limit';
import { UserError } from '@/server/errors';
import { PublicForm } from '@/components/fichas/public-form';

export const dynamic = 'force-dynamic';

// Link individual com respostas sensíveis: fora de buscadores e sem vazar o endereço por Referer.
export const metadata: Metadata = {
  title: 'Ficha',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <main className="font-apple bg-tile flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <FileWarningIcon className="text-label-secondary size-10" />
      <h1 className="text-[22px] font-semibold">{title}</h1>
      <p className="text-label-secondary max-w-sm text-[15px]">{text}</p>
    </main>
  );
}

const TITLES = {
  invalid: 'Link inválido',
  expired: 'Link expirado',
  revoked: 'Link substituído',
  used: 'Ficha já enviada',
} as const;

/** Preenchimento pelo cliente: só esta ficha, sem acesso a outras nem a observações internas. */
export default async function FichaPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    await rateLimit('form-view', 40, 60_000);
  } catch (error) {
    if (error instanceof UserError)
      return <Problem title="Muitas tentativas" text={error.message} />;
    throw error;
  }
  const form = await getPublicForm(token);
  if (!form.ok) return <Problem title={TITLES[form.problem]} text={problemMessage(form.problem)} />;
  const logoUrl = form.clerkOrgId ? await getCompanyLogoUrl(form.clerkOrgId) : null;
  return (
    <PublicForm
      token={token}
      companyName={form.companyName}
      logoUrl={logoUrl}
      privacyNotice={form.privacyNotice}
      clientFirstName={form.clientFirstName}
      formName={form.formName}
      instructions={form.instructions}
      schema={form.schema}
      initialAnswers={form.answers}
      expiresAt={form.expiresAt.toISOString()}
    />
  );
}
