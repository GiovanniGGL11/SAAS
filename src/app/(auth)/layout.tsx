import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();

  // Signing up/in while already authenticated makes Clerk reject the
  // sign_up/sign_in creation with a "session_exists" 400 — send the user
  // to the app instead of showing a form that can only fail.
  if (userId) {
    redirect('/dashboard');
  }

  return <div className="flex flex-1 items-center justify-center p-6">{children}</div>;
}
