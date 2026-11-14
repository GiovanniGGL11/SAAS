'use client';

import * as React from 'react';
import { useClerk } from '@clerk/nextjs';
import { LockIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** O login passou de 1 hora: sai da conta e volta para a tela de entrar. */
export function PlatformReauth({ maxMinutes }: { maxMinutes: number }) {
  const { signOut } = useClerk();
  const [pending, setPending] = React.useState(false);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-tile flex w-full max-w-sm flex-col items-center gap-4 rounded-[28px] p-7 text-center">
        <span className="bg-foreground/[0.06] flex size-12 items-center justify-center rounded-full">
          <LockIcon className="size-5" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Entre de novo</h1>
          <p className="text-label-secondary text-[14px] leading-snug">
            Por segurança, o painel da plataforma só abre se você entrou há menos de{' '}
            {maxMinutes === 60 ? '1 hora' : `${maxMinutes} minutos`}. Depois de entrar, abra{' '}
            <span className="text-foreground font-medium">/plataforma</span> de novo.
          </p>
        </div>
        <Button
          className="w-full"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              await signOut({ redirectUrl: '/sign-in' });
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? 'Saindo...' : 'Entrar de novo'}
        </Button>
      </div>
    </main>
  );
}
