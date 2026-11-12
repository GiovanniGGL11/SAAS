'use client';

import * as React from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';

import { isStaleDeployError, reloadForNewVersion } from '@/lib/stale-deploy';

/** Página aberta durante uma atualização do site: recarrega na versão nova em vez de dar erro. */
function onActionError(error: unknown) {
  if (!isStaleDeployError(error)) return;
  toast.info('O Atendafy foi atualizado. Recarregando a página…');
  if (!reloadForNewVersion()) {
    toast.error('O Atendafy foi atualizado. Recarregue a página (F5) para continuar.');
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
        queryCache: new QueryCache({ onError: onActionError }),
        mutationCache: new MutationCache({ onError: onActionError }),
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
