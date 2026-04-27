import { getLatestSearchSelectionForRawQuery } from './feedback-latest-selection';
import { VIRTUAL_NO_SUITABLE_CANDIDATE_KEY } from './feedback-virtual-constants';
import type { SearchResult } from './search-types';

/** Serializable “resume” state for `/search/all` radios (server → client). */
export type SearchAllSelectedCandidate =
  | {
      type: 'no_suitable_result';
      virtualCandidateKey: typeof VIRTUAL_NO_SUITABLE_CANDIDATE_KEY;
    }
  | { type: 'boq_item'; boqItemId: string };

/**
 * Latest explicit feedback for this query + kỳ giá wins; then URL; then default pick.
 */
export async function resolveSearchAllSelectedCandidate(input: {
  query: string;
  pricePeriodCode: string | undefined;
  rawSelectedItemIdFromUrl: string;
  results: SearchResult[];
  defaultPickItemId: string;
}): Promise<SearchAllSelectedCandidate | null> {
  const {
    query,
    pricePeriodCode,
    rawSelectedItemIdFromUrl,
    results,
    defaultPickItemId,
  } = input;
  const period = pricePeriodCode?.trim() || undefined;

  const latest = await getLatestSearchSelectionForRawQuery(
    query,
    period ?? null,
  );

  if (latest?.type === 'no_suitable_result') {
    return {
      type: 'no_suitable_result',
      virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
    };
  }

  if (
    latest?.type === 'selected_item' &&
    results.some((r) => r.itemId === latest.boqItemId)
  ) {
    return { type: 'boq_item', boqItemId: latest.boqItemId };
  }

  if (rawSelectedItemIdFromUrl === VIRTUAL_NO_SUITABLE_CANDIDATE_KEY) {
    return {
      type: 'no_suitable_result',
      virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
    };
  }

  if (
    rawSelectedItemIdFromUrl &&
    results.some((r) => r.itemId === rawSelectedItemIdFromUrl)
  ) {
    return { type: 'boq_item', boqItemId: rawSelectedItemIdFromUrl };
  }

  if (
    defaultPickItemId &&
    results.some((r) => r.itemId === defaultPickItemId)
  ) {
    return { type: 'boq_item', boqItemId: defaultPickItemId };
  }

  return null;
}
