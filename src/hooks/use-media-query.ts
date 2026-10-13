'use client';

import * as React from 'react';

/** Server render and the first client render both see `false`, so hydration matches. */
export function useMediaQuery(query: string): boolean {
  return React.useSyncExternalStore(
    React.useCallback(
      (onChange) => {
        const mql = window.matchMedia(query);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
      },
      [query],
    ),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below Tailwind's `md` breakpoint — phones. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
