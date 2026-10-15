import { MessageSquareHeartIcon, MessageSquareXIcon } from 'lucide-react';

import { getReviewContext } from '@/server/data/relationship';
import { ReviewForm } from '@/components/booking/review-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Avalie seu atendimento' };

/** O cliente avalia o atendimento pelo link do WhatsApp, sem login. */
export default async function AvaliarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = await getReviewContext(token);

  if (!context) {
    return (
      <main className="font-apple flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <MessageSquareXIcon className="text-label-secondary size-10" />
        <h1 className="text-[22px] font-semibold">Link inválido</h1>
        <p className="text-label-secondary text-[15px]">Peça um novo link ao estabelecimento.</p>
      </main>
    );
  }

  return (
    <main className="font-apple mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6">
      <div className="bg-tile flex flex-col gap-5 rounded-[22px] p-6">
        <MessageSquareHeartIcon className="text-system-blue size-9" />
        <div>
          <p className="text-label-secondary text-[13px]">{context.companyName}</p>
          <h1 className="text-[22px] leading-tight font-semibold">
            Como foi, {context.clientFirstName}?
          </h1>
          <p className="text-label-secondary mt-1 text-[15px]">
            {context.serviceName} com {context.professionalName}
          </p>
        </div>
        <ReviewForm
          token={token}
          existing={context.review}
          googleReviewUrl={context.googleReviewUrl}
          companyName={context.companyName}
        />
      </div>
    </main>
  );
}
