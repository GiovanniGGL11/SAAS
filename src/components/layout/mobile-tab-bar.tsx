'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import {
  CalendarDaysIcon,
  LayoutGridIcon,
  MoreHorizontalIcon,
  UsersIcon,
  VaultIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { NavList } from '@/components/layout/nav-list';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

type Tab = { label: string; href: string; icon: LucideIcon };

const COMMON_TABS: Tab[] = [
  { label: 'Início', href: '/dashboard', icon: LayoutGridIcon },
  { label: 'Agenda', href: '/agenda', icon: CalendarDaysIcon },
  { label: 'Clientes', href: '/clientes', icon: UsersIcon },
];
// Financeiro é só do admin; a equipe (recepção) usa o Caixa no lugar.
const ADMIN_TABS: Tab[] = [
  ...COMMON_TABS,
  { label: 'Financeiro', href: '/financeiro', icon: WalletIcon },
];
const STAFF_TABS: Tab[] = [...COMMON_TABS, { label: 'Caixa', href: '/caixa', icon: VaultIcon }];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** iOS-style tab bar for phones: the four most-used sections plus "Mais" for the rest. */
export function MobileTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const TABS = useAuth().orgRole === 'org:admin' ? ADMIN_TABS : STAFF_TABS;
  const inTabs = TABS.some((tab) => isActive(pathname, tab.href));

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="bg-background/80 border-foreground/[0.08] fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-[1.8] md:hidden"
      >
        <ul className="grid h-14 grid-cols-5">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <TabLink
                href={tab.href}
                label={tab.label}
                icon={tab.icon}
                active={isActive(pathname, tab.href)}
              />
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(
                'flex size-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                !inTabs ? 'text-system-blue' : 'text-label-secondary',
              )}
            >
              <MoreHorizontalIcon className="size-6" strokeWidth={!inTabs ? 2.25 : 1.75} />
              Mais
            </button>
          </li>
        </ul>
      </nav>

      <Drawer direction="bottom" open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent className="font-apple">
          <DrawerHeader className="text-left">
            <DrawerTitle>
              Atenda<span className="text-system-blue">fy</span>
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            <NavList layoutId="mobile-active" onNavigate={() => setMoreOpen(false)} />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex size-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors active:opacity-60',
        active ? 'text-system-blue' : 'text-label-secondary',
      )}
    >
      <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} />
      {label}
    </Link>
  );
}
