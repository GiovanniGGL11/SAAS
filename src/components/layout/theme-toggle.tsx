'use client';

import * as React from 'react';
import { useTheme } from '@/components/theme-provider';
import { MoonIcon, SunIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@/components/ui/button';

const emptySubscribe = () => () => {};

function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    return <Button variant="ghost" size="icon" aria-hidden className="opacity-0" />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      onClick={(event) => {
        // Grow the new theme from the center of this button.
        const rect = event.currentTarget.getBoundingClientRect();
        setTheme(isDark ? 'light' : 'dark', {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }}
      className="overflow-hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? 'sun' : 'moon'}
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 24 }}
          className="flex"
        >
          {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}
