'use client';

import * as React from 'react';
import { useSignIn, useSignUp, useClerk } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';
import { GitHubIcon, GoogleIcon } from '@/components/auth/provider-icons';

type OAuthProvider = 'oauth_google' | 'oauth_github';

export function OAuthButtons({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const clerk = useClerk();
  const [pendingProvider, setPendingProvider] = React.useState<OAuthProvider | null>(null);

  async function handleOAuth(strategy: OAuthProvider) {
    setPendingProvider(strategy);
    const params = {
      strategy,
      redirectUrl: '/sso-callback',
      redirectCallbackUrl: '/sso-callback',
    };
    if (mode === 'sign-in') {
      await signIn.sso(params);
    } else {
      await signUp.sso(params);
    }
    // On success the browser navigates away to the provider; if we're still
    // here, the request itself failed synchronously (network/config error).
    setPendingProvider(null);
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pendingProvider !== null || !clerk.loaded}
        onClick={() => handleOAuth('oauth_google')}
      >
        <GoogleIcon />
        Google
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={pendingProvider !== null || !clerk.loaded}
        onClick={() => handleOAuth('oauth_github')}
      >
        <GitHubIcon />
        GitHub
      </Button>
    </div>
  );
}
