'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useSignIn } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { SignInOAuthButtons } from '@/components/auth/oauth-buttons';
import { getClerkErrorMessage } from '@/lib/clerk-errors';

type Step = 'password' | 'forgot-email' | 'forgot-code';

export function SignInForm() {
  const { signIn } = useSignIn();
  const router = useRouter();

  const [step, setStep] = React.useState<Step>('password');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const { error } = await signIn.password({ identifier: email, password });
      if (error) {
        setError(getClerkErrorMessage(error));
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize();
        router.push('/dashboard');
      } else {
        setError('Não foi possível concluir o login. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendResetCode(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const created = await signIn.create({ identifier: email });
      if (created.error) {
        setError(getClerkErrorMessage(created.error));
        return;
      }
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) {
        setError(getClerkErrorMessage(sent.error));
        return;
      }
      setStep('forgot-code');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const verified = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (verified.error) {
        setError(getClerkErrorMessage(verified.error));
        return;
      }
      const submitted = await signIn.resetPasswordEmailCode.submitPassword({
        password: newPassword,
      });
      if (submitted.error) {
        setError(getClerkErrorMessage(submitted.error));
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize();
        router.push('/dashboard');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Renders the invisible Cloudflare Turnstile challenge if Clerk's bot
  // protection decides one is needed for this flow.
  const captchaSlot = <div id="clerk-captcha" />;

  if (step === 'forgot-email') {
    return (
      <form onSubmit={handleSendResetCode} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-email">Email</Label>
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {captchaSlot}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Enviando...' : 'Enviar código'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setStep('password')}>
          Voltar
        </Button>
      </form>
    );
  }

  if (step === 'forgot-code') {
    return (
      <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reset-code">Código recebido por email</Label>
          <Input
            id="reset-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="text-center text-lg tracking-widest"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">Nova senha</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : 'Redefinir senha e entrar'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setStep('forgot-email')}>
          Voltar
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SignInOAuthButtons />
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">ou</span>
        <Separator className="flex-1" />
      </div>
      <form onSubmit={handlePasswordSignIn} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <button
              type="button"
              onClick={() => setStep('forgot-email')}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
            >
              Esqueceu a senha?
            </button>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {captchaSlot}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </Button>
      </form>
    </div>
  );
}
