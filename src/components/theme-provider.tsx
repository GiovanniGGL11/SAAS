'use client';

import * as React from 'react';
import { flushSync } from 'react-dom';

type Theme = 'light' | 'dark' | 'system';

/** Viewport point the theme change radiates from (e.g. the toggle that was clicked). */
export type ThemeOrigin = { x: number; y: number };

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme, origin?: ThemeOrigin) => void;
  resolvedTheme: 'light' | 'dark' | undefined;
};

const STORAGE_KEY = 'theme';
// Claro para quem ainda não escolheu. Quem trocou pelo botão continua com a própria escolha,
// guardada em STORAGE_KEY; "system" (seguir o aparelho) só vale se for escolhido explicitamente.
const DEFAULT_THEME: Theme = 'light';
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
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}")||"${DEFAULT_THEME}";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

/**
 * Reveals the new theme with a circle that grows from `origin` (View
 * Transitions API, the macOS/Telegram-style effect). Browsers without it get a
 * short color crossfade instead; reduced-motion users get an instant swap.
 */
function animateThemeChange(apply: (suppressTransitions?: boolean) => void, origin?: ThemeOrigin) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply();
    return;
  }

  if (typeof document.startViewTransition !== 'function') {
    const root = document.documentElement;
    root.classList.add('theme-fade');
    apply(false);
    window.setTimeout(() => root.classList.remove('theme-fade'), 450);
    return;
  }

  const x = origin?.x ?? window.innerWidth - 40;
  const y = origin?.y ?? 28;
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const transition = document.startViewTransition(() => apply());
  transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        {
          duration: 650,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => {
      // Transition skipped (e.g. tab hidden) — the theme was still applied.
    });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME;
    try {
      return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark' | undefined>(() =>
    typeof window === 'undefined' ? undefined : resolve(theme),
  );

  const setTheme = React.useCallback((next: Theme, origin?: ThemeOrigin) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private mode, disabled) — theme just won't persist.
    }
    const nextResolved = resolve(next);
    const changesAppearance =
      document.documentElement.classList.contains('dark') !== (nextResolved === 'dark');

    const apply = (suppressTransitions = true) => {
      const restore = suppressTransitions ? disableTransitionsTemporarily() : null;
      document.documentElement.classList.toggle('dark', nextResolved === 'dark');
      flushSync(() => {
        setThemeState(next);
        setResolvedTheme(nextResolved);
      });
      restore?.();
    };

    if (!changesAppearance) {
      apply();
      return;
    }
    animateThemeChange(apply, origin);
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
