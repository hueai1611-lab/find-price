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

  /** Expand draft `byQuery` for this query to full server list so Search can render any chosen row. */
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
    pickMainTableTop(results, pricePeriodCode)?.itemId ?? results[0]?.itemId ?? '';

  if (results.length === 0) {
    return (
      <tr>
        <td colSpan={6} className="px-2 py-6 text-center text-zinc-500">
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
            className={`border-b border-zinc-200 align-top last:border-b-0 ${
              isChosen ? 'bg-emerald-50/80' : ''
            }`}
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
            <td className="border-r border-zinc-100 px-2 py-2 text-xs text-zinc-800">
              <label className="flex cursor-pointer items-center gap-2">
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
                  className="accent-zinc-800"
                />
                <span>
                  {isChosen
                    ? 'Dòng chính (bảng Search)'
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
