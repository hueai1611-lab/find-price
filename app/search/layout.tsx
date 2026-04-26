import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tra cứu',
};

export default function SearchLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
