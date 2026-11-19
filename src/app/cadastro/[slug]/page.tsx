import type { Metadata } from 'next';
import { UserXIcon } from 'lucide-react';

import { getSignupCompany } from '@/server/data/self-signup';
import { getSignupInvite } from '@/server/data/signup-invite';
import { getCompanyLogoUrl } from '@/server/data/public-booking';
import { SelfSignupForm } from '@/components/cadastro/self-signup-form';
import { whatsappLink } from '@/lib/phone';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const company = await getSignupCompany(slug);
  return {
    title: company ? `Cadastro · ${company.name}` : 'Cadastro',
    robots: { index: false, follow: false },
  };
}

/**
 * Página pública: o cliente preenche a própria ficha, sem login. Com um convite da equipe
 * (?convite=), abre mesmo com o cadastro pelo link desligado e leva para a ficha do convite.
 */
export default async function CadastroPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ convite?: string; tel?: string }>;
}) {
  const { slug } = await params;
  const { convite, tel } = await searchParams;
  const invite = convite ? await getSignupInvite(slug, convite) : null;
  const company = invite?.company ?? (convite ? null : await getSignupCompany(slug));

  if (convite && !invite) {
    return (
      <main className="font-apple bg-tile flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <UserXIcon className="text-label-secondary size-10" />
        <h1 className="text-[22px] font-semibold">Convite vencido</h1>
        <p className="text-label-secondary max-w-sm text-[15px]">
          Este link de cadastro venceu ou não vale mais. Peça um novo ao estabelecimento.
        </p>
      </main>
    );
  }

  if (!company) {
    return (
      <main className="font-apple bg-tile flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <UserXIcon className="text-label-secondary size-10" />
        <h1 className="text-[22px] font-semibold">Cadastro indisponível</h1>
        <p className="text-label-secondary max-w-sm text-[15px]">
          Este estabelecimento não está recebendo cadastros pelo link agora. Fale diretamente com
          ele para se cadastrar.
        </p>
      </main>
    );
  }

  const logoUrl = await getCompanyLogoUrl(company.clerkOrgId);
  const chatUrl = whatsappLink(company.whatsapp, 'Olá! Tenho uma dúvida sobre o cadastro.');

  return (
    <main className="font-apple bg-tile flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-6 px-4 py-8 sm:py-12">
        <header className="flex flex-col items-center gap-3 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo do Clerk, fora do domínio
            <img src={logoUrl} alt="" className="size-16 rounded-2xl object-cover shadow-sm" />
          ) : (
            <span className="bg-system-blue/12 text-system-blue flex size-16 items-center justify-center rounded-2xl text-[26px] font-bold">
              {company.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em]">
              {company.name}
            </h1>
            <p className="text-label-secondary mt-1 text-[15px]">
              {invite
                ? `Faça seu cadastro e, em seguida, preencha a ficha "${invite.template.name}".`
                : 'Faça seu cadastro. Leva menos de um minuto.'}
            </p>
          </div>
        </header>
        <SelfSignupForm
          slug={company.slug}
          companyName={company.name}
          config={company.config}
          invite={invite ? convite : undefined}
          initialPhone={invite ? tel?.replace(/\D/g, '').slice(0, 15) : undefined}
        />
        <footer className="text-label-secondary flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pb-2 text-center text-[12px]">
          {chatUrl && (
            <a href={chatUrl} target="_blank" rel="noreferrer" className="hover:underline">
              Dúvidas? Fale com {company.name} pelo WhatsApp
            </a>
          )}
          <span>Cadastro por Atendafy</span>
        </footer>
      </div>
    </main>
  );
}
