import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Fraunces, Public_Sans } from 'next/font/google';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const body = Public_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'iskole',
  description: 'From "what do I study" to funded, accepted and on track.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-paper text-text antialiased">{children}</body>
    </html>
  );
}
