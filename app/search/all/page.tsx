import Link from 'next/link';

import {
  pickMainTableTop,
  reorderSearchResultsByTongCongPresence,
} from '@/lib/search/display-result-order';
import { searchItems } from '@/lib/search/search-service';

import { SearchAllResultsTable } from './search-all-results-table';

type PageProps = {
  searchParams: Promise<{
    query?: string;
    pricePeriodCode?: string;
    selectedItemId?: string;
  }>;
};

const thBase =
  'sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 sm:px-4';

export default async function SearchAllResultsPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const query = typeof sp.query === 'string' ? sp.query.trim() : '';
  const pricePeriodCode =
    typeof sp.pricePeriodCode === 'string' && sp.pricePeriodCode.trim() !== ''
      ? sp.pricePeriodCode.trim()
      : undefined;
  const rawSelectedItemId =
    typeof sp.selectedItemId === 'string' ? sp.selectedItemId.trim() : '';

  if (!query) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950"
          role="alert"
        >
          <p className="font-medium">Thiếu tham số query</p>
          <p className="mt-1 text-xs text-amber-900/90">
            Quay lại tra cứu và chạy lại từ bảng kết quả.
          </p>
        </div>
        <Link
          href="/search"
          className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          ← Về Tra cứu
        </Link>
      </main>
    );
  }

  const { results: rawResults } = await searchItems(query, pricePeriodCode, {
    maxResults: Infinity,
  });
  const periodForOrder = pricePeriodCode ?? '';
  const results = reorderSearchResultsByTongCongPresence(
    rawResults,
    periodForOrder,
  );

  const defaultPick = pickMainTableTop(results, periodForOrder);
  const initialSelectedItemId =
    rawSelectedItemId && results.some((r) => r.itemId === rawSelectedItemId)
      ? rawSelectedItemId
      : (defaultPick?.itemId ?? results[0]?.itemId ?? '');

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Tất cả kết quả
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Cùng logic truy vấn như tra cứu chính; ưu tiên dòng có Giá Tổng lên
            trước, giữ thứ tự trong từng nhóm.
          </p>
        </div>
        <Link
          href="/search"
          className="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          ← Về Tra cứu
        </Link>
      </header>

      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-700">
        <p className="font-mono text-[11px] leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-700">query:</span> {query}
          {pricePeriodCode != null ? (
            <>
              {' '}
              <span className="text-slate-400">·</span>{' '}
              <span className="font-semibold text-slate-700">
                pricePeriodCode:
              </span>{' '}
              {pricePeriodCode}
            </>
          ) : null}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
        <div className="max-h-[min(75vh,640px)] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className={`${thBase} w-12 border-r border-slate-200`}>
                  STT
                </th>
                <th className={`${thBase} border-r border-slate-200`}>
                  Tóm tắt
                </th>
                <th
                  className={`${thBase} border-r border-slate-200 text-right`}
                >
                  Tổng cộng
                </th>
                <th className={`${thBase} border-r border-slate-200`}>
                  Đơn vị
                </th>
                <th className={`${thBase} border-r border-slate-200`}>
                  Dòng nguồn
                </th>
                <th className={thBase}>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    Không có kết quả.
                  </td>
                </tr>
              ) : (
                <SearchAllResultsTable
                  results={results}
                  query={query}
                  pricePeriodCode={pricePeriodCode ?? ''}
                  initialSelectedItemId={initialSelectedItemId}
                />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
