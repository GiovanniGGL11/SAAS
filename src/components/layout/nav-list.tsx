'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { motion } from 'motion/react';

import { cn } from '@/lib/utils';
import { navGroups, navItems } from '@/components/layout/nav-items';
import { Badge } from '@/components/ui/badge';

/**
 * Grouped navigation in the style of macOS sidebars: tinted icon chips, small
 * group captions and a selection pill that glides between items.
 */
export function NavList({
  layoutId,
  onNavigate,
}: {
  /** Distinct per mounted instance so the sidebar and mobile drawer pills don't share an animation. */
  layoutId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // A equipe (org:member) não vê as seções de gestão; o servidor também bloqueia, isto só limpa o menu.
  const { orgRole } = useAuth();
  const isAdmin = orgRole === 'org:admin';

  return (
    <nav className="flex flex-col gap-5">
      {navGroups.map((group) => (
        <div key={group} className="flex flex-col gap-0.5">
          <div className="text-label-secondary px-2.5 pb-1 text-[11px] font-semibold tracking-wide uppercase">
            {group}
          </div>
          {navItems
            .filter((item) => item.group === group && (isAdmin || !item.adminOnly))
            .map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              if (item.comingSoon) {
                return (
                  <div
                    key={item.href}
                    className="text-muted-foreground/60 flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-2.5">
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
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'focus-visible:ring-ring/50 relative flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[14px] outline-none focus-visible:ring-2',
                    isActive ? 'font-semibold' : 'text-foreground/80 hover:text-foreground',
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId={layoutId}
                      className="bg-foreground/[0.07] absolute inset-0 rounded-xl"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span
                    className="relative flex size-6 shrink-0 items-center justify-center rounded-[7px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]"
                    style={{ backgroundColor: item.color }}
                  >
                    <Icon className="size-3.5" strokeWidth={2.25} />
                  </span>
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );
}
