'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, useClerk, useSignIn, useSignUp } from '@clerk/nextjs';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PASSWORD_MIN_LENGTH, getClerkErrorMessage } from '@/lib/clerk-errors';

/*
  Aceite do convite da equipe. O e-mail do convite traz um "ticket" do Clerk:
  - quem ainda não tem conta só define nome e senha (o e-mail já vem confirmado pelo convite);
  - quem já tem conta entra direto com o ticket;
  - depois, a empresa que convidou vira a ativa e a pessoa cai na agenda dela.
*/
export function AcceptInvitation() {
  const params = useSearchParams();
  const ticket = params.get('__clerk_ticket');
  const status = params.get('__clerk_status');
  const orgId = params.get('org');
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { setActive } = useClerk();
  const { signUp } = useSignUp();
  const { signIn } = useSignIn();

  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);
  const started = React.useRef(false);

  const enterCompany = React.useCallback(async () => {
    if (orgId) {
      try {
        await setActive({ organization: orgId });
      } catch {
        // Sem a empresa ativa, a tela de empresas mostra o convite para entrar.
      }
    }
    router.replace('/agenda');
  }, [orgId, router, setActive]);

  // Já tem conta (ou já entrou): usa o ticket para entrar e vai para a empresa.
  React.useEffect(() => {
    if (started.current) return;
    if (isSignedIn) {
      started.current = true;
      void enterCompany();
      return;
    }
    if (!ticket || status !== 'sign_in' || !signIn) return;
    started.current = true;
    void (async () => {
      setBusy(true);
      const { error } = await signIn.ticket({ ticket });
      if (error) {
        setError(getClerkErrorMessage(error));
        setBusy(false);
        return;
      }
      if (signIn.status === 'complete') {
        await signIn.finalize();
        await enterCompany();
        return;
      }
      setError('Não foi possível entrar com o convite. Entre com seu e-mail e senha.');
      setBusy(false);
    })();
  }, [enterCompany, isSignedIn, signIn, status, ticket]);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!ticket || !signUp) return;
    setError(undefined);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    setBusy(true);
    try {
      const [firstName, ...rest] = name.trim().split(/\s+/);
      const { error } = await signUp.create({
        strategy: 'ticket',
        ticket,
        password,
        ...(firstName ? { firstName, lastName: rest.join(' ') || undefined } : {}),
      });
      if (error) {
        setError(getClerkErrorMessage(error));
        return;
      }
      if (signUp.status === 'complete') {
        await signUp.finalize();
        await enterCompany();
        return;
      }
      setError('Não foi possível concluir o cadastro. Tente de novo pelo link do e-mail.');
    } finally {
      setBusy(false);
    }
  }

  if (!ticket && !isSignedIn) {
    return (
      <p className="text-muted-foreground text-sm">
        Este link de convite está incompleto ou expirou. Peça um novo convite para o responsável
        pela empresa, ou{' '}
        <Link href="/sign-in" className="text-foreground underline">
          entre com sua conta
        </Link>
        .
      </p>
    );
  }

  if (status === 'sign_up' && !isSignedIn) {
    return (
      <form onSubmit={createAccount} className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Crie sua senha para ver sua agenda e seus ganhos, do celular ou do computador.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-name">Seu nome</Label>
          <Input
            id="invite-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-password">Senha</Label>
          <Input
            id="invite-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Mínimo de {PASSWORD_MIN_LENGTH} caracteres.
          </p>
        </div>
        <div id="clerk-captcha" />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Criando acesso...' : 'Criar meu acesso'}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {error ? (
        <>
          <p className="text-destructive">{error}</p>
          <Button asChild variant="outline">
            <Link href="/sign-in">Entrar com e-mail e senha</Link>
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground">Entrando na sua agenda…</p>
      )}
    </div>
  );
}
