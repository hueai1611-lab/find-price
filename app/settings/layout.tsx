import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'settings',
};

export default function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
