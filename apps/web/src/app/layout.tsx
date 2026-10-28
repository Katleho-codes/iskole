import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Cabin, Montserrat } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';

const display = Montserrat({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '700'],
});

const body = Cabin({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'iskole',
    template: '%s | iskole',
  },
  description: 'From "what do I study" to funded, accepted and on track.',
  applicationName: 'iskole',
};
export const dynamic = 'force-dynamic';
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // The proxy issues a per-request nonce. next-themes injects an inline script to set the
  // theme before paint, so it needs the nonce too or strict CSP blocks it.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    // next-themes' pre-paint script sets the class and `color-scheme` on <html> before
    // React hydrates, so the element is intentionally different from the server snapshot.
    // React's documented escape hatch is suppressHydrationWarning on the element itself.
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to content
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
