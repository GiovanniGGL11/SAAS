import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { siteUrl } from '@/lib/site-url';
import { SEO_KEYWORDS } from '@/lib/seo';
import { ThemeProvider } from '@/components/theme-provider';
import { AppClerkProvider } from '@/components/clerk-provider';
import { QueryProvider } from '@/components/query-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  // O título e a descrição começam pelo que as pessoas buscam ("sistema de agendamento online").
  title: 'Atendafy — Sistema de agendamento online, agenda e financeiro para negócios',
  description:
    'Sistema de agendamento online: seus clientes marcam sozinhos pelo link, confirmam pelo WhatsApp e você cobra, fecha o caixa e vê o lucro do mês. Para salões, barbearias, clínicas, consultórios, estúdios, pet shops, aulas e todo negócio que atende com hora marcada.',
  // O Google não usa a meta keywords para ranquear; outros buscadores ainda leem. As palavras que
  // contam estão no título, na descrição e nos textos da página inicial.
  keywords: SEO_KEYWORDS,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Atendafy',
    title: 'Atendafy — agenda cheia, caixa no controle',
    description:
      'Agendamento online, confirmação pelo WhatsApp, comanda, caixa e financeiro num lugar só.',
  },
  twitter: { card: 'summary_large_image' },
  applicationName: 'Atendafy',
  // iPhone: "Adicionar à Tela de Início" abre em tela cheia, com o ícone do app.
  appleWebApp: { capable: true, title: 'Atendafy', statusBarStyle: 'default' },
  // Declarar só `apple` fazia o Next descartar o src/app/icon.png (sem <link rel="icon"> no HTML).
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png', sizes: '256x256' }],
    apple: '/icons/apple-touch-icon.png',
  },
};

// viewport-fit=cover lets the mobile tab bar sit above the iPhone home indicator via
// env(safe-area-inset-bottom) instead of being covered by it.
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <AppClerkProvider>
            <QueryProvider>
              <TooltipProvider>
                {children}
                <Toaster />
              </TooltipProvider>
            </QueryProvider>
          </AppClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
