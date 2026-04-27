/**
 * Phase-1.1 technical / measurement helpers (lexical, deterministic).
 * Used later by retrieval/ranking — no side effects.
 */

/** Collapse spaces, unify ≤/>=, glue `N cm`, normalize D… forms (lowercase d + digits). */
export function canonicalizeTechnicalText(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\s+/g, " ")
    .trim();

  return base
    .replace(/\b(\d+)\s+cm\b/gi, "$1cm")
    .replace(/\b[dD]\s*(\d+)\s*-\s*[dD]\s*(\d+)\b/g, (_, a: string, b: string) => `d${a}-d${b}`)
    .replace(/\b[dD]\s*(\d+)\b/g, (_, n: string) => `d${n}`);
}

/** Query token is a cm value or D… token after `normalizeQuery` / tokenization. */
export function isTechnicalSearchToken(token: string): boolean {
  const t = token.trim().replace(/[,;:]+$/g, "").trim();
  return (
    /^\d+cm$/i.test(t) ||
    /^d\d+(-d\d+)?$/i.test(t) ||
    /** Plate / panel sizes (e.g. gạch 600x100) — not conjunctive lexical gates. */
    /^\d+x\d+$/i.test(t) ||
    /** Common BOQ prefix for “kích thước …” lines. */
    /^kt$/i.test(t)
  );
}

const RE_CM_VALUE = /(\d+)cm/gi;
const RE_CM_CAP = /(?:<=|≤)\s*(\d+)\s*cm/gi;
/** Ranges first (strip before singles so `d500-d600` does not yield `d500`). */
const RE_DIAMETER_RANGE = /(?<![a-z0-9])d(\d+)\s*-\s*d(\d+)(?![0-9])/gi;
/** `d10` in `d10x220` / `D10`; not a prefix of `d1000`. */
const RE_DIAMETER_SINGLE = /(?<![a-z0-9])d(\d+)(?![0-9])/gi;

/**
 * Numeric cm from query-style text after canonicalize (e.g. "21cm", "35cm").
 */
export function extractCmValuesFromQuery(canon: string): number[] {
  const out: number[] = [];
  RE_CM_VALUE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_CM_VALUE.exec(canon)) !== null) {
    out.push(parseInt(m[1], 10));
  }
  return out;
}

/**
 * Upper bounds from spec phrases like <=30cm, ≤40cm (after canonicalize).
 */
export function extractCmCapsFromSpec(canon: string): number[] {
  const caps: number[] = [];
  RE_CM_CAP.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_CM_CAP.exec(canon)) !== null) {
    caps.push(parseInt(m[1], 10));
  }
  return caps;
}

/**
 * Single-row heuristic: every query cm value is <= the largest cap found in the spec.
 * (If the line only has <=30cm, caps max=30 → 35 does not fit.)
 */
export function cmQueryFitsSpecCaps(queryCanon: string, specCanon: string): boolean {
  const qv = extractCmValuesFromQuery(queryCanon);
  const caps = extractCmCapsFromSpec(specCanon);
  if (qv.length === 0 || caps.length === 0) {
    return false;
  }
  const capMax = Math.max(...caps);
  return qv.every((v) => v <= capMax);
}

/**
 * Smallest <=…cm cap in the spec that still satisfies v <= cap (nearest valid upper bound).
 */
function nearestCmCapAtOrAbove(v: number, specCaps: number[]): number | null {
  const ok = specCaps.filter((c) => v <= c);
  return ok.length ? Math.min(...ok) : null;
}

/**
 * Ranking-only, lexical: bonus = max(0, maxBonus - (tierCap - v)).
 * Smaller tierCap (less slack) ⇒ higher score when multiple caps are compatible.
 */
export function nearestCmThresholdBonusFromSpec(
  v: number,
  specCanon: string,
  maxBonus: number
): number {
  if (maxBonus <= 0) return 0;
  const specCaps = extractCmCapsFromSpec(specCanon);
  if (specCaps.length === 0) return 0;
  const tierCap = nearestCmCapAtOrAbove(v, specCaps);
  if (tierCap == null) return 0;
  const slack = tierCap - v;
  return Math.max(0, maxBonus - slack);
}

/**
 * Diameter tokens after canonicalize, e.g. ["d10"], ["d500-d600"].
 * Uses token identity (not substring) so `d10` does not match inside `d1000` / `d800-d1000`.
 */
export function extractDiameterTokens(canon: string): string[] {
  const s = canon.toLowerCase();
  const ranges: string[] = [];
  const stripped = s.replace(
    RE_DIAMETER_RANGE,
    (_m, a: string, b: string) => {
      ranges.push(`d${a}-d${b}`);
      return " ";
    }
  );
  const singles: string[] = [];
  RE_DIAMETER_SINGLE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_DIAMETER_SINGLE.exec(stripped)) !== null) {
    singles.push(`d${m[1]}`);
  }
  return [...ranges, ...singles];
}

/**
 * Every query diameter token appears as the same extracted token in the spec.
 */
export function diameterQueryContainedInSpec(queryCanon: string, specCanon: string): boolean {
  const qs = extractDiameterTokens(queryCanon);
  if (qs.length === 0) {
    return false;
  }
  const specSet = new Set(extractDiameterTokens(specCanon));
  return qs.every((t) => specSet.has(t));
}
