import { normalizeBaseSearchString } from "./boq-search-normalize";
import { normalizeSearchQuery } from "./feedback-query-normalize";

/** Matches lexical search key: light Unicode cleanup + same pipeline as `searchItems` scoring. */
export function normalizeFeedbackLookupKey(rawQuery: string): string {
  return normalizeBaseSearchString(normalizeSearchQuery(rawQuery));
}
