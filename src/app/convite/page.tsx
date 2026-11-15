import { Suspense } from 'react';

import { AuthCard } from '@/components/auth/auth-card';
import { AcceptInvitation } from '@/components/auth/accept-invitation';

export const metadata = { title: 'Convite', robots: { index: false, follow: false } };

/** Link do convite enviado ao profissional (o Clerk acrescenta o ticket ao endereço). */
export default function ConvitePage() {
  return (
    <div className="font-apple flex flex-1 items-center justify-center p-6">
      <AuthCard title="Seu acesso ao Atendafy" description="Você foi convidado(a) para a equipe.">
        <Suspense fallback={null}>
          <AcceptInvitation />
        </Suspense>
      </AuthCard>
    </div>
  );
}
