'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useSignUp, useClerk } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { getClerkErrorMessage } from '@/lib/clerk-errors';

export function SignUpForm() {
  const { signUp } = useSignUp();
  const clerk = useClerk();
  const router = useRouter();

  const [step, setStep] = React.useState<'form' | 'verify'>('form');
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const { error } = await signUp.password({
        emailAddress: email,
        password,
        firstName,
        lastName,
      });
      if (error) {
        setError(getClerkErrorMessage(error));
        return;
      }
      if (signUp.status === 'complete') {
        await signUp.finalize();
        router.push('/dashboard');
        return;
      }
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) {
        setError(getClerkErrorMessage(sent.error));
        return;
      }
      setStep('verify');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code });
      if (error) {
        setError(getClerkErrorMessage(error));
        return;
      }
      if (signUp.status === 'complete') {
        await signUp.finalize();
        router.push('/dashboard');
      } else {
        setError('Não foi possível concluir o cadastro. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Mounts Clerk's bot-protection challenge (Cloudflare Turnstile) when
  // the instance has captcha enabled for sign-up — auto-detected by id.
  const captchaSlot = <div id="clerk-captcha" />;

  if (step === 'verify') {
    return (
      <form onSubmit={handleVerify} className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Enviamos um código de 6 dígitos para <span className="text-foreground">{email}</span>.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Código de verificação</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="text-center text-lg tracking-widest"
          />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Verificando...' : 'Confirmar e criar conta'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setStep('form')}>
          Voltar
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <OAuthButtons mode="sign-up" />
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">ou</span>
        <Separator className="flex-1" />
      </div>
      <form onSubmit={handleCreateAccount} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firstName">Nome</Label>
            <Input
              id="firstName"
              autoComplete="given-name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lastName">Sobrenome</Label>
            <Input
              id="lastName"
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
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
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">Mínimo de 8 caracteres.</p>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {captchaSlot}
        <Button type="submit" disabled={submitting || !clerk.loaded}>
          {submitting ? 'Criando conta...' : 'Criar conta'}
        </Button>
      </form>
    </div>
  );
}
