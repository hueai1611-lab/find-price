import Link from 'next/link';

import { reorderSearchResultsByTongCongPresence } from '@/lib/search/display-result-order';
import { buildShortResultSummary } from '@/lib/search/result-summary';
import { searchItems } from '@/lib/search/search-service';

type PageProps = {
  searchParams: Promise<{ query?: string; pricePeriodCode?: string }>;
};

function dash(s: string | null | undefined) {
  const t = (s ?? '').trim();
  return t ? t : '—';
}

export default async function SearchAllResultsPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;
  const query = typeof sp.query === 'string' ? sp.query.trim() : '';
  const pricePeriodCode =
    typeof sp.pricePeriodCode === 'string' && sp.pricePeriodCode.trim() !== ''
      ? sp.pricePeriodCode.trim()
      : undefined;

  if (!query) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-zinc-900">
        <p className="mb-4 text-red-800" role="alert">
          Thiếu tham số <span className="font-mono">query</span>.
        </p>
        <Link href="/search" className="text-blue-700 underline">
          ← Search
        </Link>
      </div>
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-zinc-900">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Tất cả kết quả</h1>
        <Link href="/search" className="text-blue-700 underline">
          ← Search
        </Link>
      </div>
      <p className="mb-1 font-mono text-xs text-zinc-600">
        query: <span className="font-medium text-zinc-800">{query}</span>
        {pricePeriodCode != null ? (
          <>
            {' '}
            · pricePeriodCode:{' '}
            <span className="font-medium text-zinc-800">{pricePeriodCode}</span>
          </>
        ) : null}
      </p>
      <p className="mb-4 text-xs text-zinc-500">
        Cùng logic truy vấn như{' '}
        <span className="font-mono">GET /api/search</span> — sau đó ưu tiên các
        dòng có Giá Tổng (tongCong) lên trước, giữ nguyên thứ tự tương đối trong
        từng nhóm.
      </p>

      <div className="max-h-[70vh] overflow-auto border border-zinc-300 bg-white">
        <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                STT
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                Tóm tắt
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                Tổng cộng
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                Đơn vị
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                Dòng nguồn
              </th>
              <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-mono text-[11px] font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                normalizedPrimarySearchText
              </th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-zinc-500">
                  Không có kết quả.
                </td>
              </tr>
            ) : (
              results.map((r, i) => (
                <tr
                  key={r.itemId}
                  className="border-b border-zinc-200 align-top last:border-b-0"
                >
                  <td className="border-r border-zinc-100 px-2 py-2 tabular-nums text-zinc-700">
                    {i + 1}
                  </td>
                  <td className="border-r border-zinc-100 px-2 py-2 text-zinc-800">
                    {buildShortResultSummary(r)}
                  </td>
                  <td className="border-r border-zinc-100 px-2 py-2 font-mono text-sm font-semibold tabular-nums text-zinc-900">
                    {dash(r.tongCong)}
                  </td>
                  <td className="border-r border-zinc-100 px-2 py-2 font-mono text-sm font-semibold tabular-nums text-zinc-900">
                    {dash(r.donVi)}
                  </td>
                  <td className="border-r border-zinc-100 px-2 py-2 font-mono text-[11px]">
                    <Link
                      href={`/inspect/row?itemId=${encodeURIComponent(r.itemId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-700 underline decoration-blue-600/60 hover:decoration-blue-700"
                    >
                      Row {r.sourceRowNumber ?? '—'} · {dash(r.sheetName)}
                    </Link>
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px] leading-snug break-all text-zinc-600">
                    {dash(r.normalizedPrimarySearchText)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
