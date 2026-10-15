'use client';

import Link from 'next/link';
import { useOrganizationList } from '@clerk/nextjs';
import { Building2Icon } from 'lucide-react';

/** Atalho para o painel de todas as unidades — só aparece para quem administra mais de uma. */
export function UnitsLink() {
  const { userMemberships } = useOrganizationList({ userMemberships: true });
  const adminCount = (userMemberships.data ?? []).filter((m) => m.role === 'org:admin').length;
  if (adminCount < 2) return null;
  return (
    <Link
      href="/unidades"
      className="bg-tile hover:bg-tile-hover inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-[14px] font-medium transition-colors"
    >
      <Building2Icon className="text-system-blue size-4" />
      Ver todas as {adminCount} unidades
    </Link>
  );
}
