import Link from 'next/link';

import {
  pickMainTableTop,
  reorderSearchResultsByTongCongPresence,
} from '@/lib/search/display-result-order';
import type { SearchFeedbackMeta } from '@/lib/search/feedback-no-suitable-signal';
import {
  resolveSearchAllSelectedCandidate,
} from '@/lib/search/search-all-selected-candidate';
import { searchItems } from '@/lib/search/search-service';

import { SearchAllResultsTable } from './search-all-results-table';

function SearchFeedbackMetaDevPanel({ meta }: { meta: SearchFeedbackMeta }) {
  return (
    <div
      className="mt-3 rounded-lg border border-dashed border-violet-300 bg-violet-50/70 px-3 py-2 font-mono text-[10px] leading-relaxed text-violet-950"
      aria-label="Dev only: search feedback meta"
    >
      <div className="font-semibold text-violet-900">[dev] searchFeedbackMeta</div>
      <ul className="mt-1 list-inside list-disc text-violet-900/95">
        <li>noSuitableResultCount: {meta.noSuitableResultCount}</li>
        <li>
          noSuitableResultSignatureCount: {meta.noSuitableResultSignatureCount}
        </li>
        <li>searchQualityWarning: {String(meta.searchQualityWarning)}</li>
        <li>
          totalNoSuitableWeight:{' '}
          {meta.totalNoSuitableWeight ?? '—'}
        </li>
      </ul>
      {meta.searchQualityReason ? (
        <p className="mt-1 text-[10px] text-violet-800">{meta.searchQualityReason}</p>
      ) : null}
    </div>
  );
}

type PageProps = {
  searchParams: Promise<{
    query?: string;
    pricePeriodCode?: string;
    selectedItemId?: string;
  }>;
};

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

  const { results: rawResults, searchFeedbackMeta } = await searchItems(
    query,
    pricePeriodCode,
    {
      maxResults: Infinity,
      skipNoSuitableMetaEmptyOverride: true,
    }
  );
  const periodForOrder = pricePeriodCode ?? '';
  const results = reorderSearchResultsByTongCongPresence(
    rawResults,
    periodForOrder,
  );

  const defaultPick = pickMainTableTop(results, periodForOrder);
  const initialSelectedCandidate = await resolveSearchAllSelectedCandidate({
    query,
    pricePeriodCode,
    rawSelectedItemIdFromUrl: rawSelectedItemId,
    results,
    defaultPickItemId: defaultPick?.itemId ?? results[0]?.itemId ?? '',
  });

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

      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/5 sm:p-5">
        <SearchAllResultsTable
          results={results}
          query={query}
          pricePeriodCode={pricePeriodCode ?? ''}
          initialSelectedCandidate={initialSelectedCandidate}
        />
      </div>
      {process.env.NODE_ENV !== 'production' && searchFeedbackMeta ? (
        <SearchFeedbackMetaDevPanel meta={searchFeedbackMeta} />
      ) : null}
    </main>
  );
}
