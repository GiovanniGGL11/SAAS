'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MenuIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { navItems } from '@/components/layout/nav-items';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  return (
    <Drawer direction="left" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
          <MenuIcon className="size-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Meu Negócio</DrawerTitle>
        </DrawerHeader>
        <nav className="flex flex-col gap-0.5 px-3 pb-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            if (item.comingSoon) {
              return (
                <div
                  key={item.href}
                  className="text-muted-foreground/60 flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-4" />
                    {item.label}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    em breve
                  </Badge>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
