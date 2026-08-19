import Link from 'next/link';

import { AuthCard } from '@/components/auth/auth-card';
import { SignUpForm } from '@/components/auth/sign-up-form';

export default function SignUpPage() {
  return (
    <AuthCard
      title="Criar conta"
      description="Comece a gerenciar sua empresa em minutos."
      footer={
        <span className="text-muted-foreground">
          Já tem uma conta?{' '}
          <Link href="/sign-in" className="text-foreground underline-offset-2 hover:underline">
            Entrar
          </Link>
        </span>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
