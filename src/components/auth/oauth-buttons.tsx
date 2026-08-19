'use client';

import * as React from 'react';
import { useSignIn, useSignUp } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';
import { GitHubIcon, GoogleIcon } from '@/components/auth/provider-icons';

type OAuthProvider = 'oauth_google' | 'oauth_github';
type SsoFn = (params: {
  strategy: OAuthProvider;
  redirectUrl: string;
  redirectCallbackUrl: string;
}) => Promise<unknown>;

function OAuthButtonsView({ sso }: { sso: SsoFn }) {
  const [pendingProvider, setPendingProvider] = React.useState<OAuthProvider | null>(null);

  async function handleOAuth(strategy: OAuthProvider) {
    setPendingProvider(strategy);
    await sso({
      strategy,
      redirectUrl: '/sso-callback',
      redirectCallbackUrl: '/sso-callback',
    });
    // On success the browser navigates away to the provider; if we're still
    // here, the request itself failed synchronously (network/config error).
    setPendingProvider(null);
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pendingProvider !== null}
        onClick={() => handleOAuth('oauth_google')}
      >
        <GoogleIcon />
        Google
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={pendingProvider !== null}
        onClick={() => handleOAuth('oauth_github')}
      >
        <GitHubIcon />
        GitHub
      </Button>
    </div>
  );
}

// Two variants instead of one component branching on a `mode` prop: React's
// rules of hooks mean a single component can't conditionally call
// useSignIn() OR useSignUp() based on a prop — both would always run,
// which made Clerk bootstrap a SignUp resource in the background even on
// the sign-in page (and vice versa), spamming the console with reqs for a
// resource that page never uses.
export function SignInOAuthButtons() {
  const { signIn } = useSignIn();
  // Must call as signIn.sso(...), not pass the method off by reference —
  // it's a real class method that relies on its `this` binding internally;
  // detaching it (sso={signIn.sso}) threw "Cannot read properties of
  // undefined" once invoked without that context.
  return <OAuthButtonsView sso={(params) => signIn.sso(params)} />;
}

export function SignUpOAuthButtons() {
  const { signUp } = useSignUp();
  return <OAuthButtonsView sso={(params) => signUp.sso(params)} />;
}
