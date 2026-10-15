import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
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
  title: 'Atendafy',
  description: 'Gestão completa para negócios baseados em agendamento.',
  applicationName: 'Atendafy',
  // iPhone: "Adicionar à Tela de Início" abre em tela cheia, com o ícone do app.
  appleWebApp: { capable: true, title: 'Atendafy', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
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
