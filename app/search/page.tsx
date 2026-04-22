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
    const header = ['Query', 'Tóm tắt', 'Giá Tổng', 'Đơn vị']
      .join('\t');
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-zinc-900">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Search</h1>
        <Link
          href="/settings/search"
          className="text-xs text-blue-700 underline decoration-blue-600/60"
        >
          Cài đặt retrieval (take)
        </Link>
      </div>

      <form
        onSubmit={onSubmit}
        className="mb-6 flex flex-col gap-3 border border-zinc-300 bg-zinc-50 p-4"
      >
        <label className="flex flex-col gap-1">
          <span className="font-medium text-zinc-700">
            Query (mỗi dòng = một BOQ)
          </span>
          <textarea
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey) return;
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }}
            rows={5}
            className="min-h-[6rem] w-full border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="text-xs text-zinc-500">
            Enter để chạy search · Shift+Enter để xuống dòng
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-medium text-zinc-700">pricePeriodCode</span>
          <select
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
            className="max-w-xs border border-zinc-300 bg-white px-2 py-1.5"
          >
            <option value="">Omit param (server uses first price row)</option>
            {availablePeriods.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <span className="text-xs text-zinc-500">
            Danh sách kỳ lấy từ các import đã hoàn thành (tên file / batch). Đổi
            kỳ sẽ xóa bảng kết quả — bấm Search lại để lấy giá đúng kỳ.
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-fit border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-white disabled:opacity-50"
        >
          {loading ? '…' : 'Search'}
        </button>
      </form>

      {error ? (
        <p
          className="mb-4 border border-red-300 bg-red-50 px-2 py-1.5 text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <h2 className="mb-2 font-medium text-zinc-700">Kết quả tốt nhất</h2>
      <p className="mb-2 text-xs text-zinc-500">
        Một dòng query → một dòng bảng (hạng 1). Nhiều dòng → một POST gọi{' '}
        <span className="font-mono">searchItems</span> cho từng dòng. &quot;Xem
        thêm&quot; chỉ hiện khi dòng đó có trên 1 kết quả; cùng tab, quay lại
        Search giữ nguyên nội dung đã nhập.
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={byQuery.length === 0}
          onClick={() => void copyGiáTổngColumn()}
          className="border border-zinc-400 bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-100 disabled:opacity-40"
        >
          Copy Giá Tổng
        </button>
        <button
          type="button"
          disabled={byQuery.length === 0}
          onClick={() => void copyTsvRows()}
          className="border border-zinc-400 bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-100 disabled:opacity-40"
        >
          Copy TSV
        </button>
        {copyHint ? (
          <span className="text-xs text-zinc-600" role="status">
            {copyHint}
          </span>
        ) : null}
      </div>

      <div className="max-h-[70vh] overflow-auto border border-zinc-300 bg-white">
        <table className="w-full min-w-[90%] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                STT
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                Query
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                Tóm tắt
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                Giá Tổng
              </th>
              <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-mono text-[11px] font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                Đơn vị
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                Số kết quả
              </th>
              <th className="sticky top-0 z-20 border-b border-r border-zinc-200 bg-zinc-100 px-2 py-2 text-left font-medium text-zinc-800 shadow-[0_1px_0_0_theme(colors.zinc.300)]">
                Link
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && byQuery.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-2 py-6 text-center text-zinc-500"
                >
                  Đang tìm…
                </td>
              </tr>
            ) : byQuery.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-2 py-6 text-center text-zinc-500"
                >
                  {error
                    ? '—'
                    : lastSearchAttempted
                      ? 'Không có kết quả.'
                      : 'Chưa có kết quả. Nhập query và Search.'}
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
                  <tr key={`${i}-${run.query}`} className="align-top">
                    <td className="border-r border-zinc-100 px-2 py-2 tabular-nums text-zinc-700">
                      {i + 1}
                    </td>
                    <td className="max-w-[500px] border-r border-zinc-100 px-2 py-2 text-zinc-800">
                      <span className="break-words font-mono text-[11px] leading-snug">
                        {run.query}
                      </span>
                    </td>
                    <td className="border-r border-zinc-100 px-2 py-2 text-zinc-800">
                      {top ? buildShortResultSummary(top) : '—'}
                    </td>
                    <td className="border-r border-zinc-100 px-2 py-2 font-mono text-sm font-semibold tabular-nums text-zinc-900">
                      {top
                        ? formatTongCongForSelectedPeriod(top, pricePeriodCode)
                        : '—'}
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px] leading-snug break-all text-zinc-600">
                      {top ? dash(top.donVi) : '—'}
                    </td>
                    <td className="border-r border-zinc-100 px-2 py-2">
                      <span className="text-xs tabular-nums text-zinc-600">
                        Tổng {hitTotal} kết quả
                      </span>
                    </td>
                    <td className="border-r border-zinc-100 px-2 py-2">
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
                          className="text-blue-700 underline decoration-blue-600/60 hover:decoration-blue-700"
                        >
                          Xem thêm
                        </Link>
                      ) : (
                        '—'
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
  );
}
