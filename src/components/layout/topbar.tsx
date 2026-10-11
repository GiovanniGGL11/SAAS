import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';

import { ThemeToggle } from '@/components/layout/theme-toggle';
import { MobileNav } from '@/components/layout/mobile-nav';
import { CommandMenu } from '@/components/layout/command-menu';

export function Topbar() {
  return (
    <header className="bg-background/72 border-foreground/[0.06] sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b px-4 backdrop-blur-xl backdrop-saturate-[1.8] md:px-6">
      <div className="flex min-w-0 items-center gap-1">
        <MobileNav />
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
        />
      </div>
      <div className="flex items-center gap-2">
        <CommandMenu />
        <ThemeToggle />
        <UserButton />
      </div>
    </header>
  );
}
