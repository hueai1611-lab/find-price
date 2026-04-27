import type { SearchLatestSelectionDTO } from './feedback-latest-selection';
import type { SearchFeedbackMeta } from './feedback-no-suitable-signal';
import type { SearchResult } from './search-types';

export type QueryRun = {
  query: string;
  results: SearchResult[];
  totalMatched?: number;
  /** From `/api/search` — optional quality signal (dev UI / future admin). */
  searchFeedbackMeta?: SearchFeedbackMeta;
  /** Latest explicit user selection (`select` / `no_suitable_result`) for main table display. */
  latestSearchSelection?: SearchLatestSelectionDTO | null;
  /** True when collective no-suitable feedback cleared hits for this query + period. */
  noSuitableResultSelected?: boolean;
};

export const SEARCH_DRAFT_STORAGE_KEY = 'find-price-search-draft-v2';

export type SearchDraftStored = {
  v: 1;
  queryText: string;
  pricePeriodCode: string;
  byQuery: QueryRun[];
  lastSearchAttempted: boolean;
  /** itemId shown as “best” per query line (overrides default pick). */
  selectedItemIdByQuery?: Record<string, string>;
};

export function readSearchDraft(): SearchDraftStored | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SEARCH_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SearchDraftStored;
    if (d.v !== 1 || typeof d.queryText !== 'string') return null;
    if (typeof d.pricePeriodCode !== 'string') return null;
    if (!Array.isArray(d.byQuery)) return null;
    return d;
  } catch {
    return null;
  }
}

export function writeSearchDraft(draft: SearchDraftStored): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SEARCH_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota / private mode */
  }
}
