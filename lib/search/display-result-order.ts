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
