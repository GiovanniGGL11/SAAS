'use client';

import * as React from 'react';
import { MenuIcon } from 'lucide-react';

import { NavList } from '@/components/layout/nav-list';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

export function MobileNav() {
  const [open, setOpen] = React.useState(false);

  return (
    <Drawer direction="left" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
          <MenuIcon className="size-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="font-apple">
        <DrawerHeader>
          <DrawerTitle>Atendafy</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-3 pb-6">
          <NavList layoutId="mobile-active" onNavigate={() => setOpen(false)} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
