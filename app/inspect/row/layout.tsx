import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'inspect/row',
};

export default function InspectRowLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
