/**
 * Light query cleanup for feedback storage (keeps Vietnamese characters).
 * Pair with `normalizeBaseSearchString` for the lookup key used with `searchItems`.
 */

/** Characters that are safe to strip at edges only (do not strip internal `cb400-v`, `d400`). */
const EDGE_NOISE = /^[\s.,;:!?'"()[\]{}]+|[\s.,;:!?'"()[\]{}]+$/g;

/**
 * - trim
 * - collapse whitespace
 * - lowercase (Unicode; Vietnamese diacritics preserved)
 * - trim decorative punctuation at ends only
 * - normalize curly quotes to straight quotes
 */
export function normalizeSearchQuery(input: string): string {
  let s = input.replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.toLocaleLowerCase("vi-VN");
  s = s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  s = s.replace(EDGE_NOISE, "").trim();
  return s;
}
