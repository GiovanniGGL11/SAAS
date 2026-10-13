'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { MoonIcon, SearchIcon, SunIcon } from 'lucide-react';

import { navGroups, navItems } from '@/components/layout/nav-items';
import { useTheme } from '@/components/theme-provider';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

/** Spotlight-style ⌘K / Ctrl+K palette to jump between sections. */
export function CommandMenu() {
  const { orgRole } = useAuth();
  const isAdmin = orgRole === 'org:admin';
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // event.key can be missing on synthetic keydown events some browser
      // extensions/autofill dispatch — this listener is global, so a crash
      // here takes down every page that renders the topbar.
      if (event.key?.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-foreground/[0.05] hover:bg-foreground/[0.08] text-label-secondary flex h-9 items-center gap-2 rounded-full pr-2 pl-3 text-sm transition-colors sm:w-64"
        aria-label="Buscar"
      >
        <SearchIcon className="size-4" />
        <span className="hidden flex-1 text-left sm:inline">Buscar…</span>
        <kbd className="bg-background/80 ring-foreground/10 hidden rounded-md px-1.5 py-0.5 font-sans text-[11px] ring-1 sm:inline">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Buscar"
        description="Vá para qualquer seção do app"
        className="font-apple rounded-[22px]! sm:max-w-lg"
      >
        <CommandInput placeholder="Para onde você quer ir?" />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          {navGroups.map((group) => (
            <CommandGroup key={group} heading={group}>
              {navItems
                .filter(
                  (item) =>
                    item.group === group && !item.comingSoon && (isAdmin || !item.adminOnly),
                )
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.href}
                      value={item.label}
                      onSelect={() => run(() => router.push(item.href))}
                    >
                      <span
                        className="flex size-6 items-center justify-center rounded-[7px] text-white"
                        style={{ backgroundColor: item.color }}
                      >
                        <Icon className="size-3.5 text-white" />
                      </span>
                      {item.label}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Preferências">
            <CommandItem
              value="Alternar tema claro escuro"
              onSelect={() =>
                run(() =>
                  setTheme(resolvedTheme === 'dark' ? 'light' : 'dark', {
                    x: window.innerWidth / 2,
                    y: window.innerHeight / 3,
                  }),
                )
              }
            >
              {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
              {resolvedTheme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              <CommandShortcut>Tema</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
