import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';

import { ThemeToggle } from '@/components/layout/theme-toggle';
import { CommandMenu } from '@/components/layout/command-menu';
import { AssistantButton } from '@/components/assistant/assistant-button';
import { NotificationBell } from '@/components/layout/notification-bell';

export function Topbar() {
  return (
    <header className="bg-background/72 border-foreground/[0.06] sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b px-3 backdrop-blur-xl backdrop-saturate-[1.8] md:gap-3 md:px-6">
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 overflow-hidden">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            afterCreateOrganizationUrl="/dashboard"
            appearance={{
              elements: {
                // Logo do negócio em destaque na barra (o padrão do Clerk é bem pequeno).
                organizationPreviewAvatarBox__organizationSwitcherTrigger: 'size-8 rounded-lg',
                organizationPreviewMainIdentifier__organizationSwitcherTrigger:
                  'text-[15px] font-semibold',
              },
            }}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        {/* No celular, busca e tema ficam no "Mais" (menu de baixo): a barra fica só com o essencial. */}
        <div className="hidden md:block">
          <CommandMenu />
        </div>
        <AssistantButton configured={Boolean(process.env.GEMINI_API_KEY?.trim())} />
        <NotificationBell />
        <div className="hidden md:block">
          <ThemeToggle />
        </div>
        <UserButton />
      </div>
    </header>
  );
}
