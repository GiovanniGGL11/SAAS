import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Optimistic, cookie-based check only — the first line of defense so
// unauthenticated users never render dashboard pages. It does not replace
// the mandatory `requireCurrentCompany()` check inside every Server Action,
// Route Handler and server-rendered page (see src/server/auth/require-current-company.ts).
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/onboarding(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
