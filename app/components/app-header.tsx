'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function navLink(active: boolean) {
  return [
    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-indigo-50 text-indigo-800'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ');
}

export function AppHeader() {
  const pathname = usePathname() ?? '';
  const searchActive =
    pathname === '/search' ||
    pathname.startsWith('/search/') ||
    pathname.startsWith('/inspect');
  const settingsActive = pathname.startsWith('/settings');
  const dailyFileActive =
    pathname === '/daily-file' || pathname.startsWith('/daily-file/');

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/90 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/search"
          className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg"
        >
          Smart Search
        </Link>
        <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Main">
          <Link href="/daily-file" className={navLink(dailyFileActive)}>
            File ngày
          </Link>
          <Link href="/search" className={navLink(searchActive)}>
            Tra cứu
          </Link>
          <Link href="/settings/search" className={navLink(settingsActive)}>
            Cài đặt
          </Link>
        </nav>
      </div>
    </header>
  );
}
