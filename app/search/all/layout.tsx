import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tất cả kết quả',
};

export default function SearchAllLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
