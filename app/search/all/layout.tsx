import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'search/all',
};

export default function SearchAllLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
