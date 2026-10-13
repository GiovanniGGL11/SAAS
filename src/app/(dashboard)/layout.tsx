import { redirect } from 'next/navigation';

import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
import {
  NoActiveOrganizationError,
  UnauthenticatedError,
  requireCurrentCompany,
} from '@/server/auth/require-current-company';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireCurrentCompany();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect('/sign-in');
    }
    if (error instanceof NoActiveOrganizationError) {
      redirect('/onboarding');
    }
    throw error;
  }

  return (
    <div className="font-apple flex flex-1">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] md:p-8">
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
