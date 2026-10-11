'use client';

import * as React from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { ptBR } from '@clerk/localizations';
import { dark } from '@clerk/themes';
import { useTheme } from '@/components/theme-provider';

const emptySubscribe = () => () => {};

function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <ClerkProvider
      localization={ptBR}
      appearance={{
        theme: isDark ? dark : undefined,
        variables: {
          // Apple system blue, matching --primary in globals.css.
          colorPrimary: isDark ? '#0a84ff' : '#007aff',
          borderRadius: '0.875rem',
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', var(--font-geist-sans), sans-serif",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
