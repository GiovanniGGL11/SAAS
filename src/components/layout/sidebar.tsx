'use client';

import Link from 'next/link';
import { CalendarCheck2Icon } from 'lucide-react';

import { NavList } from '@/components/layout/nav-list';

export function Sidebar() {
  return (
    <aside className="bg-sidebar/80 border-foreground/[0.06] sticky top-0 hidden h-svh w-64 shrink-0 flex-col overflow-y-auto border-r px-3 py-4 backdrop-blur-xl md:flex">
      <Link
        href="/dashboard"
        className="mb-6 flex items-center gap-2.5 px-2.5 text-[15px] font-semibold tracking-tight"
      >
        <span className="bg-system-blue flex size-8 items-center justify-center rounded-[10px] text-white shadow-[0_4px_12px_-4px_var(--system-blue)]">
          <CalendarCheck2Icon className="size-4" />
        </span>
        Atendafy
      </Link>
      <NavList layoutId="sidebar-active" />
    </aside>
  );
}
