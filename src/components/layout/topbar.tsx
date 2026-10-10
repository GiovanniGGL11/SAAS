import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';

import { ThemeToggle } from '@/components/layout/theme-toggle';
import { MobileNav } from '@/components/layout/mobile-nav';

export function Topbar() {
  return (
    <header className="bg-background/72 border-foreground/[0.06] sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 backdrop-blur-xl backdrop-saturate-[1.8] md:px-6">
      <div className="flex items-center gap-1">
        <MobileNav />
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
        />
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserButton />
      </div>
    </header>
  );
}
