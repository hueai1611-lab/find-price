import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import { AppHeader } from './components/app-header';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Smart Search',
    template: '%s · Smart Search',
  },
  description: 'Internal BOQ price search',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-slate-50 font-sans text-slate-900">
        <AppHeader />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
