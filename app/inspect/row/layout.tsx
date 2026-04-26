import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Xem dòng nguồn',
};

export default function InspectRowLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
