'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { navItems } from '@/components/layout/nav-items';
import { Badge } from '@/components/ui/badge';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r px-3 py-4 md:flex">
      <div className="px-2 pb-4 text-sm font-semibold tracking-tight">Meu Negócio</div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          if (item.comingSoon) {
            return (
              <div
                key={item.href}
                className="text-muted-foreground/60 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm"
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
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
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
    </aside>
  );
}
