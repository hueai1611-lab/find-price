'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { pickMainTableTop } from '@/lib/search/display-result-order';
import { buildShortResultSummary } from '@/lib/search/result-summary';
import {
  readSearchDraft,
  writeSearchDraft,
} from '@/lib/search/search-draft-storage';
import type { SearchResult } from '@/lib/search/search-types';

function dash(s: string | null | undefined) {
  const t = (s ?? '').trim();
  return t ? t : '—';
}

const td =
  'border-b border-slate-100 px-3 py-3 align-top text-slate-800 sm:px-4';

type Props = {
  results: SearchResult[];
  query: string;
  pricePeriodCode: string;
  initialSelectedItemId: string;
};

export function SearchAllResultsTable({
  results,
  query,
  pricePeriodCode,
  initialSelectedItemId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState(initialSelectedItemId);

  useEffect(() => {
    setSelectedId(initialSelectedItemId);
  }, [initialSelectedItemId]);

  useEffect(() => {
    if (results.length === 0) return;
    const d = readSearchDraft();
    if (!d) return;
    const idx = d.byQuery.findIndex((r) => r.query === query);
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
  }, [query, results]);

  const persistSelection = (itemId: string) => {
    const d = readSearchDraft();
    if (d) {
      writeSearchDraft({
        ...d,
        selectedItemIdByQuery: {
          ...(d.selectedItemIdByQuery ?? {}),
          [query]: itemId,
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

  const defaultPick =
    pickMainTableTop(results, pricePeriodCode)?.itemId ??
    results[0]?.itemId ??
    '';

  if (results.length === 0) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
          Không có kết quả.
        </td>
      </tr>
    );
  }

  return (
    <>
      {results.map((r, i) => {
        const isChosen = r.itemId === selectedId;
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
              {i + 1}
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
            <td className={`${td} border-r border-slate-100 font-mono text-xs`}>
              <Link
                href={`/inspect/row?itemId=${encodeURIComponent(r.itemId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-800"
              >
                Row {r.sourceRowNumber ?? '—'} · {dash(r.sheetName)}
              </Link>
            </td>
            <td className={`${td} text-xs text-slate-800`}>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name={`best-row-${encodeURIComponent(query)}`}
                  checked={isChosen}
                  disabled={isPending}
                  onChange={() => {
                    if (r.itemId === selectedId) return;
                    setSelectedId(r.itemId);
                    persistSelection(r.itemId);
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
    </>
  );
}
