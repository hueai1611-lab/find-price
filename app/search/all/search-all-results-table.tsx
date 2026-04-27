'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useState, useTransition } from 'react';

import { pickMainTableTop } from '@/lib/search/display-result-order';
import { buildShortResultSummary } from '@/lib/search/result-summary';
import type { SearchDraftStored } from '@/lib/search/search-draft-storage';
import {
  readSearchDraft,
  writeSearchDraft,
} from '@/lib/search/search-draft-storage';
import { postSearchFeedback } from '@/lib/search/search-feedback-client';
import { VIRTUAL_NO_SUITABLE_CANDIDATE_KEY } from '@/lib/search/feedback-virtual-constants';
import type { SearchAllSelectedCandidate } from '@/lib/search/search-all-selected-candidate';
import type { SearchResult } from '@/lib/search/search-types';

function dash(s: string | null | undefined) {
  const t = (s ?? '').trim();
  return t ? t : '—';
}

/** Final ranking score shown in table (same field used for sort). */
function formatSortScore(score: unknown): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return '—';
  return score.toFixed(2);
}

const td =
  'border-b border-slate-100 px-3 py-3 align-top text-slate-800 sm:px-4';

const thBase =
  'sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 sm:px-4';

const RADIO_NAME = 'search-all-best-pick';

function isVirtualNoSuitableSelected(
  c: SearchAllSelectedCandidate | null,
): boolean {
  if (!c) return false;
  return c.type === 'no_suitable_result';
}

function selectionResumeKey(c: SearchAllSelectedCandidate | null): string {
  if (!c) return '';
  if (c.type === 'no_suitable_result') return 'ns';
  return `boq:${c.boqItemId}`;
}

/** Ưu tiên session draft (vừa chọn trên Tra cứu / Xem thêm) khi DB/URL chưa khớp kỳ hoặc chậm ghi. */
function resolveCandidateFromDraft(
  d: SearchDraftStored | null,
  query: string,
  queryKey: string,
  results: SearchResult[],
): SearchAllSelectedCandidate | null {
  if (!d || results.length === 0) return null;
  const sid = (
    d.selectedItemIdByQuery?.[queryKey] ??
    d.selectedItemIdByQuery?.[query] ??
    ''
  ).trim();
  if (sid === VIRTUAL_NO_SUITABLE_CANDIDATE_KEY) {
    return {
      type: 'no_suitable_result',
      virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
    };
  }
  const idx = d.byQuery.findIndex(
    (r) => r.query.trim() === queryKey || r.query === query,
  );
  if (idx < 0) return null;
  const lat = d.byQuery[idx].latestSearchSelection;
  if (lat?.type === 'no_suitable_result') {
    return {
      type: 'no_suitable_result',
      virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
    };
  }
  if (
    lat != null &&
    (lat.type === 'selected_item' || lat.type === 'boq_item') &&
    typeof lat.boqItemId === 'string' &&
    lat.boqItemId.trim() !== ''
  ) {
    const id = lat.boqItemId.trim();
    if (results.some((r) => r.itemId === id)) {
      return { type: 'boq_item', boqItemId: id };
    }
  }
  if (sid && results.some((r) => r.itemId === sid)) {
    return { type: 'boq_item', boqItemId: sid };
  }
  return null;
}

type Props = {
  results: SearchResult[];
  query: string;
  pricePeriodCode: string;
  initialSelectedCandidate: SearchAllSelectedCandidate | null;
};

export function SearchAllResultsTable({
  results,
  query,
  pricePeriodCode,
  initialSelectedCandidate,
}: Props) {
  const router = useRouter();
  const queryKey = query.trim();
  const [isPending, startTransition] = useTransition();
  const [selectedCandidate, setSelectedCandidate] =
    useState<SearchAllSelectedCandidate | null>(initialSelectedCandidate);

  const resumeKey = selectionResumeKey(initialSelectedCandidate);

  useLayoutEffect(() => {
    if (results.length === 0) return;
    const d = readSearchDraft();
    const fromDraft = resolveCandidateFromDraft(d, query, queryKey, results);
    setSelectedCandidate(fromDraft ?? initialSelectedCandidate);
  }, [resumeKey, initialSelectedCandidate, query, queryKey, results]);

  useEffect(() => {
    if (results.length === 0) return;
    const d = readSearchDraft();
    if (!d) return;
    const idx = d.byQuery.findIndex(
      (r) => r.query.trim() === queryKey || r.query === query,
    );
    if (idx < 0) return;
    const run = d.byQuery[idx];
    if (run.results.length >= results.length) return;
    const merged = d.byQuery.map((r, i) =>
      i === idx
        ? {
            ...r,
            results,
            totalMatched: Math.max(r.totalMatched ?? 0, results.length),
          }
        : r,
    );
    writeSearchDraft({
      ...d,
      byQuery: merged,
    });
  }, [query, queryKey, results]);

  const persistRowSelection = (itemId: string) => {
    const d = readSearchDraft();
    if (d) {
      const prev = { ...(d.selectedItemIdByQuery ?? {}) };
      delete prev[query];
      delete prev[queryKey];
      const idx = d.byQuery.findIndex(
        (r) => r.query.trim() === queryKey || r.query === query,
      );
      const nextByQuery =
        idx >= 0
          ? d.byQuery.map((row, i) =>
              i === idx
                ? {
                    ...row,
                    latestSearchSelection: {
                      type: 'selected_item' as const,
                      boqItemId: itemId,
                    },
                  }
                : row,
            )
          : d.byQuery;
      writeSearchDraft({
        ...d,
        byQuery: nextByQuery,
        selectedItemIdByQuery: {
          ...prev,
          [queryKey]: itemId,
        },
      });
    }
    const params = new URLSearchParams({ query });
    const p = pricePeriodCode.trim();
    if (p) params.set('pricePeriodCode', p);
    params.set('selectedItemId', itemId);
    startTransition(() => {
      router.replace(`/search/all?${params.toString()}`);
    });
  };

  const persistClearRowSelection = () => {
    const d = readSearchDraft();
    if (d) {
      const next = { ...(d.selectedItemIdByQuery ?? {}) };
      delete next[query];
      delete next[queryKey];
      const idx = d.byQuery.findIndex(
        (r) => r.query.trim() === queryKey || r.query === query,
      );
      const nextByQuery =
        idx >= 0
          ? d.byQuery.map((row, i) =>
              i === idx
                ? {
                    ...row,
                    latestSearchSelection: {
                      type: 'no_suitable_result' as const,
                    },
                  }
                : row,
            )
          : d.byQuery;
      writeSearchDraft({
        ...d,
        byQuery: nextByQuery,
        selectedItemIdByQuery: next,
      });
    }
    const params = new URLSearchParams({ query });
    const p = pricePeriodCode.trim();
    if (p) params.set('pricePeriodCode', p);
    params.set('selectedItemId', VIRTUAL_NO_SUITABLE_CANDIDATE_KEY);
    startTransition(() => {
      router.replace(`/search/all?${params.toString()}`);
    });
  };

  const defaultPick =
    pickMainTableTop(results, pricePeriodCode)?.itemId ??
    results[0]?.itemId ??
    '';

  const visibleIds = results.map((r) => r.itemId);
  const periodOpt = pricePeriodCode.trim() || undefined;

  if (results.length === 0) {
    return (
      <div className="max-h-[min(75vh,640px)] overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <tbody>
            <tr>
              <td
                colSpan={7}
                className="px-4 py-12 text-center text-sm text-slate-500"
              >
                Không có kết quả.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={[
          'rounded-lg border px-4 py-3 shadow-sm ring-1 transition-colors',
          isVirtualNoSuitableSelected(selectedCandidate)
            ? 'border-amber-500 bg-amber-50 ring-amber-400/80 ring-2'
            : 'border-amber-200/90 bg-amber-50/60 ring-amber-900/5',
        ].join(' ')}
        role="group"
        aria-label="Phản hồi chất lượng kết quả"
      >
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name={RADIO_NAME}
            checked={isVirtualNoSuitableSelected(selectedCandidate)}
            disabled={isPending}
            onChange={() => {
              if (isVirtualNoSuitableSelected(selectedCandidate)) return;
              setSelectedCandidate({
                type: 'no_suitable_result',
                virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
              });
              persistClearRowSelection();
              postSearchFeedback({
                query,
                pricePeriodCode: periodOpt,
                action: 'no_suitable_result',
                resultBoqItemIds: visibleIds,
                resultCount: results.length,
              });
            }}
            className="mt-1 accent-amber-700"
          />
          <span className="min-w-0">
            <span className="font-medium text-slate-900">
              Không có kết quả nào phù hợp
            </span>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Nếu bạn chọn mục này, hệ thống sẽ ghi nhận rằng keyword hiện tại
              chưa trả về kết quả đúng.
            </p>
            <p className="mt-2 font-mono text-[11px] text-slate-600">
              Điểm sắp xếp: —
            </p>
          </span>
        </label>
      </div>

      <div className="max-h-[min(75vh,640px)] overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className={`${thBase} w-12 border-r border-slate-200`}>
                STT
              </th>
              <th className={`${thBase} border-r border-slate-200`}>Tóm tắt</th>
              <th className={`${thBase} border-r border-slate-200 text-right`}>
                Tổng cộng
              </th>
              <th className={`${thBase} border-r border-slate-200`}>Đơn vị</th>
              <th className={`${thBase} border-r border-slate-200`}>
                Dòng nguồn
              </th>
              <th className={`${thBase} border-r border-slate-200 text-right`}>
                Điểm sắp xếp
              </th>
              <th className={thBase}>Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const rank = i + 1;
              const isChosen =
                selectedCandidate?.type === 'boq_item' &&
                selectedCandidate.boqItemId === r.itemId;
              return (
                <tr
                  key={r.itemId}
                  className={[
                    'transition-colors hover:bg-slate-50/90',
                    isChosen
                      ? 'border-l-2 border-l-indigo-500 bg-indigo-50/60'
                      : 'border-l-2 border-l-transparent',
                  ].join(' ')}
                >
                  <td
                    className={`${td} border-r border-slate-100 font-medium tabular-nums text-slate-500`}
                  >
                    {rank}
                  </td>
                  <td className={`${td} max-w-md border-r border-slate-100`}>
                    {buildShortResultSummary(r)}
                  </td>
                  <td
                    className={`${td} border-r border-slate-100 text-right font-mono text-sm font-semibold tabular-nums text-slate-900`}
                  >
                    {dash(r.tongCong)}
                  </td>
                  <td
                    className={`${td} border-r border-slate-100 font-mono text-xs text-slate-600`}
                  >
                    {dash(r.donVi)}
                  </td>
                  <td
                    className={`${td} border-r border-slate-100 font-mono text-xs`}
                  >
                    <Link
                      href={`/inspect/row?itemId=${encodeURIComponent(r.itemId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        postSearchFeedback({
                          query,
                          boqItemId: r.itemId,
                          pricePeriodCode: periodOpt,
                          action: 'click',
                          selectedRank: rank,
                          resultCount: results.length,
                        })
                      }
                      className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-800"
                    >
                      Row {r.sourceRowNumber ?? '—'} · {dash(r.sheetName)}
                    </Link>
                  </td>
                  <td
                    className={`${td} border-r border-slate-100 text-right font-mono text-sm tabular-nums text-slate-800`}
                  >
                    {formatSortScore(r.score)}
                  </td>
                  <td className={`${td} text-xs text-slate-800`}>
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="radio"
                        name={RADIO_NAME}
                        checked={isChosen}
                        disabled={isPending}
                        onChange={() => {
                          if (
                            selectedCandidate?.type === 'boq_item' &&
                            selectedCandidate.boqItemId === r.itemId
                          ) {
                            return;
                          }
                          setSelectedCandidate({
                            type: 'boq_item',
                            boqItemId: r.itemId,
                          });
                          persistRowSelection(r.itemId);
                          postSearchFeedback({
                            query,
                            boqItemId: r.itemId,
                            pricePeriodCode: periodOpt,
                            action: 'select',
                            selectedRank: rank,
                            resultCount: results.length,
                          });
                        }}
                        className="mt-0.5 accent-indigo-600"
                      />
                      <span className="leading-snug">
                        {isChosen
                          ? 'Dòng chính (bảng Tra cứu)'
                          : r.itemId === defaultPick
                            ? 'Mặc định hệ thống'
                            : '—'}
                      </span>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
