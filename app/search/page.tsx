'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  getDisplayedTop,
  pickMainTableTop,
  reorderSearchResultsByTongCongPresence,
} from '@/lib/search/display-result-order';
import { buildShortResultSummary } from '@/lib/search/result-summary';
import type { SearchResult } from '@/lib/search/search-types';
import { MAX_BATCH_SEARCH_QUERIES } from '@/lib/search/batch-search-query-limit';
import {
  type QueryRun,
  readSearchDraft,
  writeSearchDraft,
} from '@/lib/search/search-draft-storage';

type ApiErrorBody = { error?: string };

function dash(s: string | null | undefined) {
  const t = (s ?? '').trim();
  return t ? t : '—';
}

/**
 * Giá Tổng chỉ từ đúng kỳ form đang chọn: tránh bảng cũ (vd. Q2) khi đổi sang Q1.
 * Nếu API trả `tongCong` null / rỗng cho kỳ đó → "—" (không lấy số kỳ khác).
 */
function formatTongCongForSelectedPeriod(
  top: SearchResult,
  formPricePeriodCode: string,
) {
  const want = formPricePeriodCode.trim();
  if (want) {
    const got = (top.pricePeriodCode ?? '').trim();
    if (got !== want) return '—';
  }
  return dash(top.tongCong);
}

/** Giá để dán Excel: rỗng nếu không có số (giữ đúng số dòng). */
function tongCongForClipboard(
  top: SearchResult | undefined,
  formPricePeriodCode: string,
): string {
  if (!top) return '';
  const s = formatTongCongForSelectedPeriod(top, formPricePeriodCode);
  if (s === '—' || !s.trim()) return '';
  return s.trim();
}

function tsvCell(s: string): string {
  return s.replace(/\t/g, ' ').replace(/\r/g, '').replace(/\n/g, ' ');
}

/** One BOQ item query per non-empty line (trimmed). */
function parseItemQueries(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function moreResultsHref(
  queryTrimmed: string,
  pricePeriodCode: string,
  selectedItemId?: string,
) {
  const params = new URLSearchParams({ query: queryTrimmed });
  const p = pricePeriodCode.trim();
  if (p) params.set('pricePeriodCode', p);
  const sid = selectedItemId?.trim();
  if (sid) params.set('selectedItemId', sid);
  return `/search/all?${params.toString()}`;
}

function parseTotalMatched(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function resolvePeriodAfterLoad(
  draftPeriod: string | undefined,
  periods: string[],
): string {
  if (draftPeriod !== undefined) {
    const t = draftPeriod.trim();
    if (t === '') return '';
    if (periods.includes(t)) return t;
    return periods[0] ?? '';
  }
  if (periods.includes('Q2_2026')) return 'Q2_2026';
  return periods[0] ?? '';
}

export default function SearchToolPage() {
  /** Same defaults on server + client first paint (sessionStorage only after mount). */
  const [queryText, setQueryText] = useState('');
  /** Filled after mount from draft + /api/search/price-periods (SSR stays empty string). */
  const [pricePeriodCode, setPricePeriodCode] = useState('');
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
  const [byQuery, setByQuery] = useState<QueryRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** True after a completed submit (so we can distinguish “no search yet” vs “0 hits”). */
  const [lastSearchAttempted, setLastSearchAttempted] = useState(false);
  const [selectedItemIdByQuery, setSelectedItemIdByQuery] = useState<
    Record<string, string>
  >({});
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const copyGiáTổngColumn = useCallback(async () => {
    if (byQuery.length === 0) return;
    const lines = byQuery.map((run) => {
      const top = getDisplayedTop(
        run,
        pricePeriodCode,
        selectedItemIdByQuery[run.query],
      );
      return tongCongForClipboard(top, pricePeriodCode);
    });
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint('Đã copy Giá Tổng (mỗi dòng một ô).');
    } catch {
      setCopyHint('Không copy được (trình duyệt chặn clipboard).');
    }
    window.setTimeout(() => setCopyHint(null), 2500);
  }, [byQuery, pricePeriodCode, selectedItemIdByQuery]);

  const copyTsvRows = useCallback(async () => {
    if (byQuery.length === 0) return;
    const header = ['Query', 'Tóm tắt', 'Giá Tổng', 'Đơn vị'].join('\t');
    const rows = byQuery.map((run) => {
      const top = getDisplayedTop(
        run,
        pricePeriodCode,
        selectedItemIdByQuery[run.query],
      );
      const q = tsvCell(run.query);
      const summary = top ? tsvCell(buildShortResultSummary(top)) : '';
      const price = tongCongForClipboard(top, pricePeriodCode);
      const unit = top ? tsvCell(dash(top.donVi)) : '';
      return [q, summary, price, unit].join('\t');
    });
    const text = [header, ...rows].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint('Đã copy TSV (có dòng tiêu đề).');
    } catch {
      setCopyHint('Không copy được (trình duyệt chặn clipboard).');
    }
    window.setTimeout(() => setCopyHint(null), 2500);
  }, [byQuery, pricePeriodCode, selectedItemIdByQuery]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = readSearchDraft();
      if (!cancelled && d) {
        /* eslint-disable react-hooks/set-state-in-effect */
        setQueryText(d.queryText);
        setByQuery(d.byQuery);
        setLastSearchAttempted(d.lastSearchAttempted);
        setSelectedItemIdByQuery(d.selectedItemIdByQuery ?? {});
        /* eslint-enable react-hooks/set-state-in-effect */
      }

      let periods: string[] = [];
      try {
        const res = await fetch('/api/search/price-periods', {
          cache: 'no-store',
        });
        const data: { pricePeriodCodes?: unknown } = await res.json();
        if (Array.isArray(data.pricePeriodCodes)) {
          periods = data.pricePeriodCodes.filter(
            (x): x is string => typeof x === 'string' && x.trim().length > 0,
          );
        }
      } catch {
        /* keep periods = [] */
      }

      if (cancelled) return;
      setAvailablePeriods(periods);
      const nextPeriod = resolvePeriodAfterLoad(d?.pricePeriodCode, periods);
      /* eslint-disable react-hooks/set-state-in-effect */
      setPricePeriodCode(nextPeriod);

      const restored = d?.byQuery;
      if (
        Array.isArray(restored) &&
        restored.length > 0 &&
        restored.some((r) => r.totalMatched === undefined)
      ) {
        const p2 = nextPeriod.trim();
        try {
          const filled = await Promise.all(
            restored.map(async (run) => {
              if (run.totalMatched !== undefined) return run;
              const params = new URLSearchParams({ query: run.query });
              if (p2) params.set('pricePeriodCode', p2);
              const res = await fetch(`/api/search?${params.toString()}`, {
                cache: 'no-store',
              });
              if (!res.ok) {
                return { ...run, totalMatched: run.results.length };
              }
              const data: { totalMatched?: unknown; results?: unknown } =
                await res.json();
              const rawLen = Array.isArray(data.results)
                ? data.results.length
                : run.results.length;
              return {
                ...run,
                totalMatched: parseTotalMatched(data.totalMatched, rawLen),
              };
            }),
          );
          if (!cancelled) {
            setByQuery(filled);
            if (d) {
              writeSearchDraft({
                v: 1,
                queryText: d.queryText,
                pricePeriodCode: nextPeriod,
                byQuery: filled,
                lastSearchAttempted: d.lastSearchAttempted,
                selectedItemIdByQuery: d.selectedItemIdByQuery,
              });
            }
          }
        } catch {
          /* giữ byQuery đã restore */
        }
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onVis() {
      if (document.visibilityState !== 'visible') return;
      const d = readSearchDraft();
      if (!d) return;
      if (d.selectedItemIdByQuery) {
        setSelectedItemIdByQuery(d.selectedItemIdByQuery);
      }
      if (d.byQuery.length > 0) {
        setByQuery(d.byQuery);
      }
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    const lines = parseItemQueries(queryText);
    if (lines.length === 0) {
      setByQuery([]);
      setSelectedItemIdByQuery({});
      setError('Nhập ít nhất một dòng query (mỗi dòng = một BOQ).');
      setLastSearchAttempted(true);
      setLoading(false);
      return;
    }

    if (lines.length > MAX_BATCH_SEARCH_QUERIES) {
      setByQuery([]);
      setSelectedItemIdByQuery({});
      setError(
        `Tối đa ${MAX_BATCH_SEARCH_QUERIES} dòng BOQ (mỗi dòng = một BOQ).`,
      );
      setLastSearchAttempted(true);
      setLoading(false);
      return;
    }

    try {
      const p = pricePeriodCode.trim();

      if (lines.length === 1) {
        const params = new URLSearchParams({ query: lines[0] });
        if (p) params.set('pricePeriodCode', p);
        const res = await fetch(`/api/search?${params.toString()}`, {
          cache: 'no-store',
        });
        const data: {
          results?: SearchResult[];
          totalMatched?: unknown;
        } & ApiErrorBody = await res.json();

        if (!res.ok) {
          setByQuery([]);
          setSelectedItemIdByQuery({});
          setError(
            typeof data.error === 'string' ? data.error : res.statusText,
          );
          return;
        }

        const raw = Array.isArray(data.results) ? data.results : [];
        const totalMatched = parseTotalMatched(data.totalMatched, raw.length);
        const next: QueryRun[] = [
          {
            query: lines[0],
            results: reorderSearchResultsByTongCongPresence(
              raw,
              pricePeriodCode,
            ),
            totalMatched,
          },
        ];
        const sel: Record<string, string> = {};
        for (const run of next) {
          const t = pickMainTableTop(run.results, pricePeriodCode);
          if (t) sel[run.query] = t.itemId;
        }
        setByQuery(next);
        setSelectedItemIdByQuery(sel);
        writeSearchDraft({
          v: 1,
          queryText,
          pricePeriodCode,
          byQuery: next,
          lastSearchAttempted: true,
          selectedItemIdByQuery: sel,
        });
        return;
      }

      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          queries: lines,
          ...(p ? { pricePeriodCode: p } : {}),
        }),
      });
      const data: { byQuery?: unknown } & ApiErrorBody = await res.json();

      if (!res.ok) {
        setByQuery([]);
        setSelectedItemIdByQuery({});
        setError(typeof data.error === 'string' ? data.error : res.statusText);
        return;
      }

      const rawRuns = Array.isArray(data.byQuery) ? data.byQuery : [];
      const next = rawRuns.map((run: unknown) => {
        const r = run as {
          query?: string;
          results?: unknown;
          totalMatched?: unknown;
        };
        const raw = Array.isArray(r.results) ? r.results : [];
        const totalMatched = parseTotalMatched(r.totalMatched, raw.length);
        return {
          query: typeof r.query === 'string' ? r.query : '',
          results: reorderSearchResultsByTongCongPresence(
            raw as SearchResult[],
            pricePeriodCode,
          ),
          totalMatched,
        };
      });
      const sel: Record<string, string> = {};
      for (const run of next) {
        const t = pickMainTableTop(run.results, pricePeriodCode);
        if (t) sel[run.query] = t.itemId;
      }
      setByQuery(next);
      setSelectedItemIdByQuery(sel);
      writeSearchDraft({
        v: 1,
        queryText,
        pricePeriodCode,
        byQuery: next,
        lastSearchAttempted: true,
        selectedItemIdByQuery: sel,
      });
    } catch {
      setByQuery([]);
      setSelectedItemIdByQuery({});
      setError('Request failed');
    } finally {
      setLoading(false);
      setLastSearchAttempted(true);
    }
  }

  const colCount = 7;

  const thBase =
    'sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 sm:px-4';
  const tdBase =
    'border-b border-slate-100 px-3 py-3 align-top text-slate-800 sm:px-4';

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 text-sm sm:px-6 sm:py-8">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Tra cứu BOQ
        </h1>
        <p className="mt-0.5 max-w-2xl text-xs leading-snug text-slate-600 sm:text-sm sm:leading-relaxed">
          Mỗi dòng một BOQ (tối đa {MAX_BATCH_SEARCH_QUERIES} dòng) · chọn kỳ
          giá · Enter chạy search, Shift+Enter xuống dòng.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="mb-6 grid grid-cols-1 gap-3 lg:gap-[40px]  rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm ring-1 ring-slate-900/5 sm:gap-4 sm:p-4 lg:grid-cols-12 lg:gap-4"
      >
        <div className="flex min-w-0 flex-col gap-1 lg:col-span-8">
          <label
            htmlFor="search-query"
            className="text-sm font-medium text-slate-700"
          >
            Query{' '}
            <span className="font-normal text-slate-500">
              (mỗi dòng = một BOQ)
            </span>
          </label>
          <textarea
            id="search-query"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey) return;
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }}
            rows={3}
            className="max-h-36 min-h-[120px] w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="text-[11px] text-slate-500 mt-[8px]">
            Enter = search · Shift+Enter = xuống dòng
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-2 border-t border-slate-100 pt-3 sm:border-0 sm:pt-0 lg:col-span-4 lg:self-stretch lg:border-0 lg:pt-0 lg:pb-[30px]">
          <label htmlFor="search-period" className="block min-w-0 w-full">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Kỳ giá{' '}
              <span className="font-mono text-xs font-normal text-slate-500">
                pricePeriodCode
              </span>
            </span>
            <select
              id="search-period"
              value={pricePeriodCode}
              onChange={(e) => {
                const v = e.target.value;
                setPricePeriodCode(v);
                setByQuery([]);
                setSelectedItemIdByQuery({});
                setError(null);
                setLastSearchAttempted(false);
                writeSearchDraft({
                  v: 1,
                  queryText,
                  pricePeriodCode: v,
                  byQuery: [],
                  lastSearchAttempted: false,
                  selectedItemIdByQuery: {},
                });
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Bỏ qua (server dùng dòng giá đầu tiên)</option>
              {availablePeriods.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50 sm:h-[42px] sm:px-6 lg:mt-auto lg:h-10"
          >
            {loading ? 'Đang tìm…' : 'Search'}
          </button>
        </div>

        {/* <p className="col-span-full text-[11px] leading-snug text-slate-500">
          Kỳ giá theo import đã hoàn thành; đổi kỳ xóa bảng kết quả — cần Search
          lại.
        </p> */}
      </form>

      {error ? (
        <p
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="space-y-4" aria-labelledby="results-heading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2
              id="results-heading"
              className="text-lg font-semibold text-slate-900"
            >
              Kết quả tốt nhất
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Một dòng query → một dòng bảng. Nhiều dòng gọi{' '}
              <span className="font-mono text-slate-600">searchItems</span> theo
              từng dòng. &quot;Xem thêm&quot; khi có trên một kết quả.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={byQuery.length === 0}
              onClick={() => void copyGiáTổngColumn()}
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
            >
              Copy Giá Tổng
            </button>
            <button
              type="button"
              disabled={byQuery.length === 0}
              onClick={() => void copyTsvRows()}
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
            >
              Copy TSV
            </button>
            {copyHint ? (
              <span className="text-xs text-slate-600" role="status">
                {copyHint}
              </span>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
          <div className="max-h-[min(70vh,560px)] overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th className={`${thBase} w-12 border-r border-slate-200`}>
                    STT
                  </th>
                  <th className={`${thBase} border-r border-slate-200`}>
                    Query
                  </th>
                  <th className={`${thBase} border-r border-slate-200`}>
                    Tóm tắt
                  </th>
                  <th
                    className={`${thBase} border-r border-slate-200 text-right`}
                  >
                    Giá Tổng
                  </th>
                  <th className={`${thBase} border-r border-slate-200`}>
                    Đơn vị
                  </th>
                  <th className={`${thBase} border-r border-slate-200`}>
                    Số kết quả
                  </th>
                  <th className={`${thBase}`}>Thao tác</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading && byQuery.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="px-4 py-12 text-center text-sm text-slate-500"
                    >
                      Đang tìm…
                    </td>
                  </tr>
                ) : byQuery.length === 0 ? (
                  <tr>
                    <td
                      colSpan={colCount}
                      className="px-4 py-12 text-center text-sm text-slate-500"
                    >
                      {error
                        ? '—'
                        : lastSearchAttempted
                          ? 'Không có kết quả.'
                          : 'Chưa có kết quả. Nhập query và bấm Search.'}
                    </td>
                  </tr>
                ) : (
                  byQuery.map((run, i) => {
                    const top = getDisplayedTop(
                      run,
                      pricePeriodCode,
                      selectedItemIdByQuery[run.query],
                    );
                    const hitTotal = run.totalMatched ?? run.results.length;
                    const showMoreLink = hitTotal > 1;
                    const moreHref = moreResultsHref(
                      run.query,
                      pricePeriodCode,
                      top?.itemId,
                    );
                    return (
                      <tr
                        key={`${i}-${run.query}`}
                        className="transition-colors hover:bg-slate-50/80"
                      >
                        <td
                          className={`${tdBase} border-r border-slate-100 font-medium tabular-nums text-slate-500`}
                        >
                          {i + 1}
                        </td>
                        <td
                          className={`${tdBase} max-w-[min(100vw,28rem)] border-r border-slate-100`}
                        >
                          <span className="break-words font-mono text-[11px] leading-snug text-slate-800">
                            {run.query}
                          </span>
                        </td>
                        <td
                          className={`${tdBase} max-w-md border-r border-slate-100 text-slate-800`}
                        >
                          {top ? buildShortResultSummary(top) : '—'}
                        </td>
                        <td
                          className={`${tdBase} border-r border-slate-100 text-right font-mono text-sm font-semibold tabular-nums text-slate-900`}
                        >
                          {top
                            ? formatTongCongForSelectedPeriod(
                                top,
                                pricePeriodCode,
                              )
                            : '—'}
                        </td>
                        <td
                          className={`${tdBase} border-r border-slate-100 font-mono text-xs text-slate-600`}
                        >
                          {top ? dash(top.donVi) : '—'}
                        </td>
                        <td
                          className={`${tdBase} border-r border-slate-100 text-xs tabular-nums text-slate-600`}
                        >
                          Tổng {hitTotal} kết quả
                        </td>
                        <td className={tdBase}>
                          {showMoreLink ? (
                            <Link
                              href={moreHref}
                              onClick={() =>
                                writeSearchDraft({
                                  v: 1,
                                  queryText,
                                  pricePeriodCode,
                                  byQuery,
                                  lastSearchAttempted,
                                  selectedItemIdByQuery,
                                })
                              }
                              className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800"
                            >
                              Xem thêm
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
