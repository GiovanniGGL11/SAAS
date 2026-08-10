'use client';

import * as React from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { useTheme } from 'next-themes';

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
      appearance={{
        theme: isDark ? dark : undefined,
        variables: {
          colorPrimary: 'oklch(0.205 0 0)',
          borderRadius: '0.625rem',
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
