import { isTechnicalSearchToken } from "./technical-match";

/**
 * Normalized (ASCII) tokens treated as weak BOQ phrasing — dropped when building
 * reduced queries. Keep list small to avoid stripping meaningful technical words.
 */
export const BOQ_QUERY_FILLER_TOKENS = new Set([
  "cong", // công (công tác boilerplate)
  "tac", // tác
  "vao", // vào
  "he", // hệ
  "tai", // tại
  "vi", // vị (vị trí)
  "tri", // trí
  "bo", // bổ
  "sung", // sung
  "cac", // các
  "cua", // của
  "va", // và
  "voi", // với
  "theo", // theo
  "cho", // cho
  "trong", // trong
  "ngoai", // ngoài
  "khi", // khi
  "de", // để
  "la", // là
  "mot", // một
  "nhung", // nhưng
  "phia", // phía
  "ben", // bên
  "duoi", // dưới
  "tren", // trên
]);

/** Cap how many reduced queries we try (each is a full `searchItems` pass). */
export const MAX_REDUCED_QUERY_FALLBACKS = 14;

/**
 * Build ordered reduced queries when the full normalized query retrieves nothing.
 * Order: (1) all non-filler tokens joined, (2) consecutive bigrams on stripped tokens,
 * (3) single tokens length ≥5 or technical tokens (cm / D…).
 */
export function buildReducedSearchQueries(normalizedFullQuery: string): string[] {
  const fullTrim = normalizedFullQuery.trim();
  const tokens = fullTrim.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];

  const stripped = tokens.filter(
    (t) => !BOQ_QUERY_FILLER_TOKENS.has(t) || isTechnicalSearchToken(t)
  );
  if (stripped.length === 0) return [];

  const out: string[] = [];

  const joined = stripped.join(" ").trim();
  if (joined && joined !== fullTrim) {
    out.push(joined);
  }

  for (let i = 0; i < stripped.length - 1; i++) {
    out.push(`${stripped[i]} ${stripped[i + 1]}`);
  }

  for (const t of stripped) {
    if (t.length >= 5 || isTechnicalSearchToken(t)) {
      out.push(t);
    }
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const q of out) {
    const key = q.trim();
    if (!key || key === fullTrim) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(key);
    if (deduped.length >= MAX_REDUCED_QUERY_FALLBACKS) break;
  }
  return deduped;
}
