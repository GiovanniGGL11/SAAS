import Image from 'next/image';
import Link from 'next/link';
import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';

import { ThemeToggle } from '@/components/layout/theme-toggle';
import { CommandMenu } from '@/components/layout/command-menu';
import { AssistantButton } from '@/components/assistant/assistant-button';
import { NotificationBell } from '@/components/layout/notification-bell';

export function Topbar() {
  return (
    <header className="bg-background/72 border-foreground/[0.06] sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b px-3 backdrop-blur-xl backdrop-saturate-[1.8] md:gap-3 md:px-6">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* On phones the sidebar is gone and navigation lives in the bottom tab bar. */}
        <Link href="/dashboard" aria-label="Início" className="-m-2 shrink-0 p-2 md:hidden">
          <Image src="/images/logo.png" alt="" width={28} height={28} className="size-7" />
        </Link>
        <div className="min-w-0 overflow-hidden">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            afterCreateOrganizationUrl="/dashboard"
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <CommandMenu />
        <AssistantButton configured={Boolean(process.env.GEMINI_API_KEY?.trim())} />
        <NotificationBell />
        <ThemeToggle />
        <UserButton />
      </div>
    </header>
  );
}
