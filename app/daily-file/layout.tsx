import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'File ngày',
};

export default function DailyFileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
