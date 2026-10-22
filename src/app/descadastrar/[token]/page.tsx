import { BellOffIcon, LinkIcon } from 'lucide-react';

import { getOptOutContext } from '@/server/data/marketing-consent';
import { OptOutForm } from '@/components/booking/opt-out-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Preferências de mensagens', robots: { index: false } };

/** O cliente sai (ou volta) da lista de promoções pelo link da mensagem, sem login. */
export default async function DescadastrarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = await getOptOutContext(token);

  if (!context) {
    return (
      <main className="font-apple flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <LinkIcon className="text-label-secondary size-10" />
        <h1 className="text-[22px] font-semibold">Link inválido</h1>
        <p className="text-label-secondary text-[15px]">
          Peça ao estabelecimento para não receber mais promoções.
        </p>
      </main>
    );
  }

  return (
    <main className="font-apple mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <div className="bg-tile flex flex-col gap-5 rounded-[22px] p-6">
        <BellOffIcon className="text-system-blue size-9" />
        <div>
          <p className="text-label-secondary text-[13px]">{context.companyName}</p>
          <h1 className="text-[22px] leading-tight font-semibold">
            Promoções e novidades, {context.clientFirstName}
          </h1>
          <p className="text-label-secondary mt-1 text-[15px]">
            Mensagens sobre os seus horários (confirmação e lembrete) continuam chegando
            normalmente.
          </p>
        </div>
        <OptOutForm token={token} initialOptedOut={context.optedOut} />
      </div>
    </main>
  );
}
