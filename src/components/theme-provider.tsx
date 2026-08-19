'use client';

import * as React from 'react';

type Theme = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark' | undefined;
};

const STORAGE_KEY = 'theme';
const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemTheme() : theme;
}

/** Suppresses CSS transitions for one frame so the class swap below doesn't animate. */
function disableTransitionsTemporarily() {
  const style = document.createElement('style');
  style.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.appendChild(style);
  void window.getComputedStyle(style).transition;
  return () => window.setTimeout(() => document.head.removeChild(style), 0);
}

/**
 * Runs synchronously during HTML parsing (before React hydrates) so the
 * correct theme class is on <html> before first paint — see
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
 * The type swap avoids React's dev-mode "script tag" warning for scripts
 * rendered by a component: text/javascript so the browser executes it on the
 * initial HTML parse, text/plain (inert) on later client renders.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    try {
      return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
    } catch {
      return 'system';
    }
  });
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark' | undefined>(() =>
    typeof window === 'undefined' ? undefined : resolve(theme),
  );

  const setTheme = React.useCallback((next: Theme) => {
    const restore = disableTransitionsTemporarily();
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private mode, disabled) — theme just won't persist.
    }
    const nextResolved = resolve(next);
    document.documentElement.classList.toggle('dark', nextResolved === 'dark');
    setResolvedTheme(nextResolved);
    restore();
  }, []);

  React.useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = getSystemTheme();
      document.documentElement.classList.toggle('dark', next === 'dark');
      setResolvedTheme(next);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  const value = React.useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <script
        type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
      />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    return { theme: 'system', setTheme: () => {}, resolvedTheme: undefined };
  }
  return ctx;
}
