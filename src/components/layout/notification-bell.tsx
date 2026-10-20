'use client';

import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import {
  BellIcon,
  CakeIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarPlusIcon,
  CalendarXIcon,
  ClockIcon,
  FileTextIcon,
  ListChecksIcon,
  PackageIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-media-query';
import { listNotificationsAction } from '@/server/actions/notification-actions';
import type { Notice, NoticeKind } from '@/server/data/notifications';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

const ICONS: Record<NoticeKind, { icon: LucideIcon; className: string }> = {
  client_booked: { icon: CalendarPlusIcon, className: 'text-system-blue bg-system-blue/10' },
  client_canceled: { icon: CalendarXIcon, className: 'text-system-red bg-system-red/10' },
  client_rescheduled: {
    icon: CalendarClockIcon,
    className: 'text-system-indigo bg-system-indigo/10',
  },
  client_confirmed: { icon: CalendarCheckIcon, className: 'text-system-green bg-system-green/10' },
  upcoming: { icon: ClockIcon, className: 'text-system-blue bg-system-blue/10' },
  unconfirmed: { icon: TriangleAlertIcon, className: 'text-system-indigo bg-system-indigo/10' },
  low_stock: { icon: PackageIcon, className: 'text-system-red bg-system-red/10' },
  supply_shortage: {
    icon: PackageIcon,
    className: 'text-amber-600 bg-amber-500/10 dark:text-amber-400',
  },
  birthday: { icon: CakeIcon, className: 'text-system-green bg-system-green/10' },
  approvals: { icon: SparklesIcon, className: 'text-system-blue bg-system-blue/10' },
  tasks_due: { icon: ListChecksIcon, className: 'text-system-orange bg-system-orange/10' },
  quotes_waiting: { icon: FileTextIcon, className: 'text-system-indigo bg-system-indigo/10' },
  task_reminder: { icon: BellIcon, className: 'text-system-orange bg-system-orange/10' },
};

// ---- Lido / dispensado, por pessoa, no navegador ------------------------------------------------
// Lido com useSyncExternalStore: no servidor e na hidratação vale "nada lido", sem divergir do HTML.

type SeenState = { read: string[]; dismissed: string[] };
const EMPTY = '{"read":[],"dismissed":[]}';
const SEEN_EVENT = 'notices:seen-change';
// Se o navegador bloquear o localStorage, vale ao menos durante a visita.
const memory = new Map<string, string>();

function readSeen(key: string): string {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeSeen(key: string, state: SeenState) {
  // Guarda só os mais recentes: ids de avisos antigos não voltam mais.
  const value = JSON.stringify({
    read: state.read.slice(0, 300),
    dismissed: state.dismissed.slice(0, 300),
  });
  try {
    localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

function subscribeSeen(onChange: () => void) {
  window.addEventListener(SEEN_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(SEEN_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function parseSeen(raw: string): SeenState {
  try {
    const parsed = JSON.parse(raw) as Partial<SeenState>;
    return {
      read: Array.isArray(parsed.read) ? parsed.read : [],
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
    };
  } catch {
    return { read: [], dismissed: [] };
  }
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 0) return `em ${Math.max(1, -minutes)} min`;
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `há ${hours} h` : `há ${Math.round(hours / 24)} d`;
}

export function NotificationBell() {
  const { orgId, userId } = useAuth();
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const key = `atendafy:avisos:${orgId ?? 'none'}:${userId ?? 'none'}`;
  const raw = React.useSyncExternalStore(
    subscribeSeen,
    () => readSeen(key),
    () => EMPTY,
  );
  const seen = React.useMemo(() => parseSeen(raw), [raw]);

  // A cada minuto, e só com a aba visível (o React Query pausa o intervalo em segundo plano).
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => listNotificationsAction(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const dismissed = new Set(seen.dismissed);
  const read = new Set(seen.read);
  const notices = (query.data ?? []).filter((n) => !dismissed.has(n.id));
  const unread = notices.filter((n) => !read.has(n.id)).length;

  function markAllRead() {
    const ids = notices.map((n) => n.id).filter((id) => !read.has(id));
    if (ids.length) writeSeen(key, { ...seen, read: [...ids, ...seen.read] });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    // Abrir a lista conta como "vi": o contador some, os avisos continuam até serem dispensados.
    if (next) markAllRead();
  }

  function dismiss(id: string) {
    writeSeen(key, { ...seen, dismissed: [id, ...seen.dismissed] });
  }

  function dismissAll() {
    writeSeen(key, { ...seen, dismissed: [...notices.map((n) => n.id), ...seen.dismissed] });
  }

  const trigger = (
    <button
      type="button"
      aria-label={unread ? `Avisos: ${unread} não lidos` : 'Avisos'}
      title="Avisos"
      className="bg-foreground/[0.05] hover:bg-foreground/[0.08] text-label-secondary relative flex size-9 items-center justify-center rounded-full transition-colors"
      onClick={isMobile ? () => onOpenChange(true) : undefined}
    >
      <BellIcon className="size-[18px]" />
      {unread > 0 && (
        <span className="bg-system-red absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white tabular-nums">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );

  const list = (
    <NoticeList
      notices={notices}
      loading={query.isPending}
      failed={query.isError}
      onNavigate={() => setOpen(false)}
      onDismiss={dismiss}
      onDismissAll={dismissAll}
    />
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer direction="bottom" open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="font-apple">
            <DrawerHeader className="text-left">
              <DrawerTitle>Avisos</DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              {list}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="font-apple w-96 rounded-2xl p-2">
        <p className="px-2 pt-1 text-sm font-semibold">Avisos</p>
        <div className="max-h-[70vh] overflow-y-auto">{list}</div>
      </PopoverContent>
    </Popover>
  );
}

function NoticeList({
  notices,
  loading,
  failed,
  onNavigate,
  onDismiss,
  onDismissAll,
}: {
  notices: Notice[];
  loading: boolean;
  failed: boolean;
  onNavigate: () => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}) {
  if (loading) {
    return <p className="text-label-secondary px-2 py-6 text-center text-sm">Carregando…</p>;
  }
  if (failed && notices.length === 0) {
    return (
      <p className="text-label-secondary px-2 py-6 text-center text-sm">
        Não foi possível carregar os avisos.
      </p>
    );
  }
  if (notices.length === 0) {
    return (
      <p className="text-label-secondary px-2 py-6 text-center text-sm">Nenhum aviso por agora.</p>
    );
  }

  return (
    <div>
      <ul className="space-y-0.5">
        {notices.map((notice) => {
          const { icon: Icon, className } = ICONS[notice.kind];
          return (
            <li key={notice.id} className="group hover:bg-foreground/[0.05] flex rounded-xl">
              <Link
                href={notice.href}
                onClick={onNavigate}
                className="flex min-w-0 flex-1 items-start gap-3 px-2 py-2.5"
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full',
                    className,
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{notice.title}</span>
                    {notice.at && notice.kind !== 'upcoming' && (
                      <span className="text-label-secondary shrink-0 text-xs">
                        {timeAgo(notice.at)}
                      </span>
                    )}
                  </span>
                  <span className="text-label-secondary line-clamp-2 text-[13px]">
                    {notice.body}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                aria-label="Dispensar aviso"
                onClick={() => onDismiss(notice.id)}
                className="text-label-secondary hover:text-foreground flex w-10 shrink-0 items-center justify-center md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              >
                <XIcon className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-foreground/[0.06] mt-1 border-t pt-1">
        <button
          type="button"
          onClick={onDismissAll}
          className="text-system-blue hover:bg-foreground/[0.05] w-full rounded-xl px-2 py-2.5 text-sm font-medium"
        >
          Limpar todos
        </button>
      </div>
    </div>
  );
}
