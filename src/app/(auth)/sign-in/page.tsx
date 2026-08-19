import Link from 'next/link';

import { AuthCard } from '@/components/auth/auth-card';
import { SignInForm } from '@/components/auth/sign-in-form';

export default function SignInPage() {
  return (
    <AuthCard
      title="Entrar"
      description="Acesse o painel da sua empresa."
      footer={
        <span className="text-muted-foreground">
          Não tem uma conta?{' '}
          <Link href="/sign-up" className="text-foreground underline-offset-2 hover:underline">
            Criar conta
          </Link>
        </span>
      }
    >
      <SignInForm />
    </AuthCard>
  );
}
