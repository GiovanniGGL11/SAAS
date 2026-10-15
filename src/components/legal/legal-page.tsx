import Link from 'next/link';
import Image from 'next/image';

/** Página de texto legal: legível no celular, com data de atualização e links entre si. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="font-apple flex flex-1 flex-col">
      <header className="border-foreground/[0.06] border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
          <Link
            href="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
          >
            <Image src="/images/logo.png" alt="" width={28} height={28} className="size-7" />
            <span>
              Atenda<span className="text-system-blue">fy</span>
            </span>
          </Link>
          <nav className="text-label-secondary flex gap-4 text-[14px]">
            <Link href="/termos" className="hover:text-foreground">
              Termos
            </Link>
            <Link href="/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-5 py-12">
        <h1 className="text-[32px] leading-tight font-bold tracking-[-0.03em] md:text-[40px]">
          {title}
        </h1>
        <p className="text-label-secondary mt-2 text-[14px]">Última atualização: {updated}</p>
        <div className="legal-prose mt-8 flex flex-col gap-4 text-[16px] leading-relaxed">
          {children}
        </div>
      </main>
    </div>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 text-[21px] font-semibold tracking-[-0.02em]">{children}</h2>;
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
