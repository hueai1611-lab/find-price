import type { SearchLatestSelectionDTO } from './feedback-latest-selection';
import type { SearchResult } from './search-types';

/**
 * True when Giá Tổng would be a real value for this row: non-empty tongCong, and when
 * `formPricePeriodCode` is set, `pricePeriodCode` on the result must match (same as main Search UI).
 */
export function rowHasDisplayableTongCong(
  r: SearchResult,
  formPricePeriodCode: string,
): boolean {
  const want = formPricePeriodCode.trim();
  if (want) {
    const got = (r.pricePeriodCode ?? '').trim();
    if (got !== want) return false;
  }
  return Boolean((r.tongCong ?? '').trim());
}

/**
 * Stable partition: rows with displayable tongCong first (original relative order),
 * then rows without (original order). Does not sort by numeric price.
 */
export function reorderSearchResultsByTongCongPresence(
  results: SearchResult[],
  formPricePeriodCode: string,
): SearchResult[] {
  const priced: SearchResult[] = [];
  const unpriced: SearchResult[] = [];
  for (const r of results) {
    if (rowHasDisplayableTongCong(r, formPricePeriodCode)) {
      priced.push(r);
    } else {
      unpriced.push(r);
    }
  }
  return [...priced, ...unpriced];
}

/** First row after tongCong-first reorder (= first priced hit, else former rank #1). */
export function pickMainTableTop(
  results: SearchResult[],
  formPricePeriodCode: string,
): SearchResult | undefined {
  const ordered = reorderSearchResultsByTongCongPresence(
    results,
    formPricePeriodCode,
  );
  return ordered[0];
}

/**
 * Row shown on the main Search table: explicit `selectedItemId` if it exists in `run.results`,
 * otherwise default `pickMainTableTop`.
 */
export function getDisplayedTop(
  run: { results: SearchResult[] },
  formPricePeriodCode: string,
  selectedItemId: string | undefined,
): SearchResult | undefined {
  if (run.results.length === 0) return undefined;
  const id = selectedItemId?.trim();
  if (id) {
    const hit = run.results.find((r) => r.itemId === id);
    if (hit) return hit;
  }
  return pickMainTableTop(run.results, formPricePeriodCode);
}

export type MainSearchDisplayMode =
  | 'no_suitable_result'
  | 'selected_item'
  | 'selected'
  | 'default';

export type MainSearchDisplay = {
  mode: MainSearchDisplayMode;
  /** Row to render; undefined when `mode === "no_suitable_result"` or no candidates. */
  item: SearchResult | undefined;
};

/** Inputs for main `/search` row display (one line = one query). */
export type MainSearchDisplayRunInput = {
  query: string;
  results: SearchResult[];
  latestSearchSelection?: SearchLatestSelectionDTO | null;
  formPricePeriodCode: string;
  /**
   * Set when collective no-suitable feedback cleared hits for this query + price period.
   */
  noSuitableResultSelected?: boolean;
};

/**
 * Single source of truth for the main `/search` table row.
 * Priority: meta-driven no-suitable empty → latest no_suitable → latest selected_item in results → draft selected id in results → default top.
 */
export function getMainSearchRowDisplay(
  run: MainSearchDisplayRunInput,
  selectedItemIdByQuery: Record<string, string>,
): MainSearchDisplay {
  const qKey = run.query.trim();
  const latest = run.latestSearchSelection;
  const selectedId =
    (selectedItemIdByQuery[qKey] ?? selectedItemIdByQuery[run.query] ?? '')
      .trim();

  if (run.noSuitableResultSelected === true) {
    return { mode: 'no_suitable_result', item: undefined };
  }

  if (latest != null && latest.type === 'no_suitable_result') {
    return { mode: 'no_suitable_result', item: undefined };
  }
  if (
    latest != null &&
    (latest.type === 'selected_item' || latest.type === 'boq_item') &&
    latest.boqItemId
  ) {
    const hit = run.results.find((r) => r.itemId === latest.boqItemId);
    if (hit) return { mode: 'selected_item', item: hit };
  }
  if (selectedId) {
    const hit = run.results.find((r) => r.itemId === selectedId);
    if (hit) return { mode: 'selected', item: hit };
  }
  const def = pickMainTableTop(run.results, run.formPricePeriodCode);
  return { mode: 'default', item: def };
}

/** Initial `selectedItemIdByQuery` after a search or latest-selection sync (keys = trimmed query). */
export function buildInitialSelectedItemIdByQuery(
  runs: {
    query: string;
    results: SearchResult[];
    latestSearchSelection?: SearchLatestSelectionDTO | null;
    noSuitableResultSelected?: boolean;
  }[],
  formPricePeriodCode: string,
  prevSelected?: Record<string, string> | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const run of runs) {
    const q = run.query.trim();
    const lat = run.latestSearchSelection;
    if (run.noSuitableResultSelected === true) continue;
    if (lat?.type === 'no_suitable_result') continue;
    const latBoq =
      lat != null &&
      (lat.type === 'selected_item' || lat.type === 'boq_item') &&
      lat.boqItemId
        ? lat.boqItemId
        : '';
    if (latBoq) {
      const hit = run.results.find((r) => r.itemId === latBoq);
      if (hit) {
        out[q] = hit.itemId;
        continue;
      }
    }
    const prevId = (prevSelected?.[q] ?? prevSelected?.[run.query] ?? '').trim();
    if (prevId) {
      const hit = run.results.find((r) => r.itemId === prevId);
      if (hit) {
        out[q] = hit.itemId;
        continue;
      }
    }
    const t = pickMainTableTop(run.results, formPricePeriodCode);
    if (t) out[q] = t.itemId;
  }
  return out;
}
