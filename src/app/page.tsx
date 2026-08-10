import Link from 'next/link';

import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-sm font-semibold tracking-tight">Meu Negócio</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Entrar</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Criar conta</Link>
          </Button>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance">
          O SaaS de agendamentos mais completo do Brasil
        </h1>
        <p className="text-muted-foreground max-w-lg text-balance">
          Fundação do projeto em construção — agenda, clientes, financeiro e muito mais.
        </p>
        <Button asChild>
          <Link href="/sign-up">Começar agora</Link>
        </Button>
      </main>
    </div>
  );
}
