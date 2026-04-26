import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'daily-file',
};

export default function DailyFileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
