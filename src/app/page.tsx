import { ThemeToggle } from '@/components/layout/theme-toggle';

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-sm font-semibold tracking-tight">Meu Negócio</span>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance">
          O SaaS de agendamentos mais completo do Brasil
        </h1>
        <p className="text-muted-foreground max-w-lg text-balance">
          Fundação do projeto em construção — agenda, clientes, financeiro e muito mais.
        </p>
      </main>
    </div>
  );
}
