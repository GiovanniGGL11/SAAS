'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Sem assinatura em dia (e só com o bloqueio ligado): o admin vai para a tela de assinatura; a
 * equipe vê um aviso. A própria tela de assinatura sempre abre.
 */
export function BillingGate({
  blocked,
  isAdmin,
  children,
}: {
  blocked: boolean;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (!blocked || pathname.startsWith('/assinatura')) return <>{children}</>;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-[26px] font-bold tracking-tight">A assinatura precisa ser renovada</h1>
      <p className="text-label-secondary text-[15px]">
        {isAdmin
          ? 'O período de teste ou o último pagamento terminou. Escolha um plano para continuar usando — seus dados estão guardados.'
          : 'A assinatura do Atendafy desta empresa está pendente. Fale com o responsável pela conta.'}
      </p>
      {isAdmin && (
        <Link
          href="/assinatura"
          className="bg-system-blue rounded-full px-6 py-2.5 font-semibold text-white"
        >
          Ver planos
        </Link>
      )}
    </div>
  );
}

/** Aviso no topo: fim do teste chegando ou pagamento atrasado (só para o admin). */
export function BillingBanner({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Link
      href="/assinatura"
      className="bg-system-blue/10 text-foreground hover:bg-system-blue/15 block px-4 py-2 text-center text-[13px] font-medium"
    >
      {text} <span className="text-system-blue">Ver planos →</span>
    </Link>
  );
}
