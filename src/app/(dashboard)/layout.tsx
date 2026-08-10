import { redirect } from 'next/navigation';

import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
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
    <div className="flex flex-1">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
