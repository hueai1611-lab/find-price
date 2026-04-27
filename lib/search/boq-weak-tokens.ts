import { BOQ_QUERY_FILLER_TOKENS } from "./query-fallback";
import { isTechnicalSearchToken } from "./technical-match";

/**
 * Lexical tokens that may appear in queries / BĐG boilerplate but should not
 * dominate token-overlap or primary-coverage scoring (strong tokens drive meaning).
 */
const WEAK_LEXICAL_EXTRA = new Set<string>([
  "loai",
  "bao",
  "gom",
  "chi",
  "tiet",
  "mau",
  "sac",
  "nha",
  "thau",
  "trinh",
  "duyet",
  "phe",
  "truoc",
  "hoac",
]);

/** Multiplier applied to per-token overlap budget for weak lexicals. */
export const BOQ_WEAK_TOKEN_OVERLAP_MULTIPLIER = 0.28;

export function isBoqWeakScoringToken(token: string): boolean {
  const t = token.replace(/[,;:]+$/g, "").trim().toLowerCase();
  if (t.length < 2) return true;
  if (BOQ_QUERY_FILLER_TOKENS.has(t)) return true;
  if (WEAK_LEXICAL_EXTRA.has(t)) return true;
  if (isTechnicalSearchToken(t)) return true;
  return false;
}
