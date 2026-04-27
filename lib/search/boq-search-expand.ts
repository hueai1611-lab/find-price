import { BOQ_SYNONYM_GROUPS } from "./boq-synonym-dictionary";
import { BOQ_QUERY_FILLER_TOKENS } from "./query-fallback";
import { canonicalizeTechnicalText, extractDiameterTokens, isTechnicalSearchToken } from "./technical-match";

const MAX_EXPANSION_CHARS = 1200;

const PIPE_CONTEXT = /\b(ong|pvc|hdpe|upvc|ppr|gang|thep|nhua|nuoc|thoat|cap\s+nuoc|dn\d{2,4})\b/i;
const DN_BY_OUTER_D: Record<string, string> = {
  /** conservative, project-requested examples */
  d90: "dn80",
  d110: "dn100",
};

function diameterAliasesFromText(normalized: string): string[] {
  const canon = canonicalizeTechnicalText(normalized);
  const ds = extractDiameterTokens(canon);
  if (ds.length === 0) return [];
  const out: string[] = [];

  const pipeish = PIPE_CONTEXT.test(normalized);
  for (const tok of ds) {
    const m = /^d(\d+)$/.exec(tok);
    if (!m) continue;
    const n = m[1]!;
    out.push(`${n}mm`, `phi${n}`, `duong kinh ${n}`);
    if (pipeish) {
      const dn = DN_BY_OUTER_D[`d${n}`];
      if (dn) out.push(dn);
    }
  }
  return out;
}

/**
 * For any synonym group that matches `normalized` (base search string), append
 * `inject` tokens that are not already found as substrings in `normalized`
 * (keeps size small; long phrases are still one token for `contains` checks).
 */
export function buildBoqExpansionSuffix(normalizedPrimaryOrBlob: string): string {
  const s = normalizedPrimaryOrBlob;
  if (!s.trim()) return "";
  const extra: string[] = [];

  // Derived technical aliases (diameter variants + optional DN).
  for (const t of diameterAliasesFromText(s)) {
    const n = t.toLowerCase().replace(/\s+/g, " ").trim();
    if (n && !s.includes(n)) extra.push(n);
  }

  for (const g of BOQ_SYNONYM_GROUPS) {
    let any = false;
    for (const re of g.match) {
      re.lastIndex = 0;
      if (re.test(s)) {
        any = true;
        break;
      }
    }
    if (!any) continue;
    for (const t of g.inject) {
      const n = t.toLowerCase().replace(/\s+/g, " ").trim();
      if (n && !s.includes(n)) {
        extra.push(n);
      }
    }
  }
  const out = extra.join(" ").replace(/\s+/g, " ").trim();
  return out.length > MAX_EXPANSION_CHARS
    ? out.slice(0, MAX_EXPANSION_CHARS).replace(/\s+\S*$/, "").trim()
    : out;
}

/**
 * Unique tokens (length >= 2) for retrieval + scoring: split `normalizedQuery`
 * plus one-word **alias** codes from any matching synonym group (avoids
 * inflating AND with every word of a long phrase on the query side; row
 * `buildBoqExpansionSuffix` still carries full phrases for `contains` there).
 */
function stripTrailingQueryPunct(token: string): string {
  return token.replace(/[,;:]+$/g, "").trim();
}

/** Filler + technical / size-catalog tokens excluded from primary AND conjuncts. */
export function isRetrievalNoiseToken(token: string): boolean {
  const t = stripTrailingQueryPunct(token).toLowerCase();
  if (t.length < 2) return true;
  if (BOQ_QUERY_FILLER_TOKENS.has(t)) return true;
  return isTechnicalSearchToken(t);
}

/**
 * Tokens that must each hit primary (nhóm / nội dung / quy / expansion) in AND retrieval,
 * after dropping noise and material-family tokens covered by `retrievalSynonymInjectBundles`.
 */
export function collectRetrievalConjunctiveQueryTokens(normalizedQuery: string): string[] {
  const raw = collectQuerySearchTokens(normalizedQuery)
    .map((x) => stripTrailingQueryPunct(x))
    .filter((x) => x.length >= 2);

  const excludedExact = new Set<string>();
  for (const g of BOQ_SYNONYM_GROUPS) {
    const matched = g.match.some((re) => {
      re.lastIndex = 0;
      return re.test(normalizedQuery);
    });
    if (!matched) continue;
    for (const inj of g.inject) {
      if (!inj.includes(" ") && inj.trim().length >= 2) {
        excludedExact.add(inj.trim().toLowerCase());
      }
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const key = t.toLowerCase();
    if (excludedExact.has(key)) continue;
    if (isRetrievalNoiseToken(t)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * For each synonym group matched by the query, one OR-slot over inject phrases/codes
 * (e.g. porcelain vs ceramic vs granite) so rows are not rejected for missing one alias.
 */
export function retrievalSynonymInjectBundles(normalizedQuery: string): string[][] {
  const bundles: string[][] = [];
  for (const g of BOQ_SYNONYM_GROUPS) {
    const matched = g.match.some((re) => {
      re.lastIndex = 0;
      return re.test(normalizedQuery);
    });
    if (!matched) continue;
    const parts = g.inject
      .map((inj) => inj.toLowerCase().trim())
      .filter((inj) => inj.length >= 2);
    if (parts.length) bundles.push(parts);
  }
  return bundles;
}

export function collectQuerySearchTokens(normalizedQuery: string): string[] {
  const base = normalizedQuery
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const set = new Set<string>(base);
  const s = normalizedQuery;
  for (const g of BOQ_SYNONYM_GROUPS) {
    let any = false;
    for (const re of g.match) {
      re.lastIndex = 0;
      if (re.test(s)) {
        any = true;
        break;
      }
    }
    if (!any) continue;
    for (const t of g.inject) {
      const n = t.toLowerCase().replace(/\s+/g, " ").trim();
      if (n.length < 2 || n.includes(" ")) continue;
      set.add(n);
    }
  }
  return Array.from(set);
}
