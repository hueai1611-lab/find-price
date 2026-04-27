/**
 * Pattern-driven ranking signals (BOQ): phrases, weak dims, auxiliary rows, units.
 * Used only from `calculate-score` — deterministic, no DB writes.
 */

/** Row looks like auxiliary / supporting work (normalized ASCII). */
export const BOQ_AUXILIARY_ROW_HINT =
  /\b(gia\s*cong|cat\s+vien|cat\s+tia|cat\s+gom|cat\s+gach|van\s*chuyen|boc\s+xep|phu\s*kien|bo\s+sung|nhan\s*cong|xu\s*ly\s*phu|xu\s*ly\s*moi\s*noi|khoet\s+lo|cat\s+lo|khoan\s+lo|mai\s+canh|xu\s+ly\s+canh|thao\s*do|pha\s*do)\b/i;

/** Query explicitly asks for auxiliary-type work — do not penalize main-vs-aux then. */
export const BOQ_AUXILIARY_QUERY_INTENT = BOQ_AUXILIARY_ROW_HINT;

/**
 * Query is clearly about main finishing (ốp/lát + tường/chân/viền/trụ/cột) without
 * auxiliary intent — extra nudge so “gia công / phụ trợ” lines stay below main lines.
 */
const MAIN_FINISHING_WORK_QUERY =
  /\b(op|lat)\b[\s\S]{0,48}\b(chan\s+tuong|tuong|nen|vien|tru|cot)\b|\b(chan\s+tuong|vien\s+tuong|vien\s+tru)\b[\s\S]{0,48}\b(op|lat|gach)\b/i;

/**
 * Construction phrases: bonus only when the same pattern matches both query and row haystack
 * (avoids boosting rows that mention a phrase the user did not ask for).
 */
export const BOQ_DUAL_SIDE_PHRASES: readonly { id: string; re: RegExp }[] = [
  /** Cho phép vài từ giữa “ốp” và “chân tường” (vd. ốp gạch vào chân tường). */
  { id: "op_chan_tuong", re: /\bop(?:\s+[a-z]{1,}){0,10}\s+chan\s*tuong\b/i },
  { id: "op_gach", re: /\bop[^a-z0-9]{0,18}gach\b/i },
  { id: "op_tuong", re: /\bop[^a-z0-9]{0,18}tuong\b/i },
  { id: "lat_nen", re: /\blat[^a-z0-9]{0,14}nen\b/i },
  { id: "vien_tuong", re: /vien[^a-z0-9]{0,12}tuong/i },
  { id: "vien_tru", re: /vien[^a-z0-9]{0,12}tru\b/i },
  { id: "cot_bang_gach", re: /cot[^a-z0-9]{0,16}bang[^a-z0-9]{0,16}gach/i },
  { id: "be_tong_cot_thep", re: /be[^a-z0-9]{0,10}tong[^a-z0-9]{0,12}cot[^a-z0-9]{0,12}thep/i },
  { id: "vua_xi_mang", re: /vua[^a-z0-9]{0,10}xi[^a-z0-9]{0,10}mang/i },
  { id: "dao_dat", re: /\bdao[^a-z0-9]{0,10}dat\b/i },
  { id: "dap_dat", re: /\bdap[^a-z0-9]{0,12}dat\b/i },
  { id: "van_chuyen_dat", re: /van[^a-z0-9]{0,12}chuyen[^a-z0-9]{0,12}dat/i },
  { id: "lap_duong_cot_thep", re: /lap[^a-z0-9]{0,14}duong[^a-z0-9]{0,14}cot[^a-z0-9]{0,12}thep/i },
  { id: "lap_cot_thep", re: /lap[^a-z0-9]{0,18}cot[^a-z0-9]{0,14}thep/i },
  { id: "nhan_cong", re: /\bnhan[^a-z0-9]{0,8}cong\b/i },
  { id: "thao_do", re: /\bthao[^a-z0-9]{0,8}do\b/i },
];

const PHRASE_MATCH_BONUS_EACH = 4;
const PHRASE_MATCH_BONUS_CAP = 20;

const WEAK_DIM_BONUS_PER_HIT = 1.5;
const WEAK_DIM_BONUS_CAP = 5;

const AUX_PENALTY_WHEN_QUERY_MAIN_LIKE = 7;
const AUX_EXTRA_PENALTY_FINISHING_QUERY = 3;

const UNIT_MATCH_BONUS = 5;
const UNIT_MISMATCH_PENALTY = 2;
const TILING_IMPLIED_M2_BONUS = 2;
const IMPLIED_UNIT_SOFT_BONUS = 2;

const TILE_COVERING_CONTEXT =
  /\b(op|lat|nen|tuong|gach|porcelain|granite|ceramic|granite\/td|td)\b/i;

/** Viền / len / nẹp — thường gặp ĐVT md (chỉ nudge khi không có đơn vị rõ trong query). */
const EDGING_LINEAR_CONTEXT =
  /\b(vien|len\s+tuong|len\s+chan|nep|dai\s+chay|chieu\s+dai)\b/i;

const EARTHWORK_OR_CONCRETE_VOLUME_CONTEXT =
  /\b(dao\s+dat|dap\s+dat|do\s+be\s+tong|dung\s+be\s+tong|dao\s+va|ket\s+cau\s+be\s+tong)\b/i;

const STEEL_BY_WEIGHT_CONTEXT =
  /\b(cot\s+thep|thep\s+tron|thep\s+han|thep\s+cau|luoi\s+thep|mac\s+thep)\b/i;

const IMPLIED_M3_IN_QUERY = /\bm3\b/i;

/** Extract 600x100 style keys from normalized text. */
export function extractPlanarDimKeys(text: string): Set<string> {
  const set = new Set<string>();
  const re = /\b(\d{2,4})\s*x\s*(\d{2,4})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    set.add(`${m[1]}x${m[2]}`.toLowerCase());
  }
  return set;
}

export function scoreWeakDimensionOverlap(queryNorm: string, rowHaystack: string): number {
  const q = extractPlanarDimKeys(queryNorm);
  if (q.size === 0) return 0;
  const r = extractPlanarDimKeys(rowHaystack);
  let hits = 0;
  for (const k of q) {
    if (r.has(k)) hits++;
  }
  return Math.min(WEAK_DIM_BONUS_CAP, hits * WEAK_DIM_BONUS_PER_HIT);
}

export function scoreDualSideConstructionPhrases(
  queryNorm: string,
  rowHaystack: string,
): { total: number; byId: Record<string, number> } {
  const byId: Record<string, number> = {};
  let total = 0;
  for (const p of BOQ_DUAL_SIDE_PHRASES) {
    p.re.lastIndex = 0;
    if (!p.re.test(queryNorm)) continue;
    p.re.lastIndex = 0;
    if (!p.re.test(rowHaystack)) continue;
    const add = Math.min(
      PHRASE_MATCH_BONUS_EACH,
      PHRASE_MATCH_BONUS_CAP - total,
    );
    if (add <= 0) break;
    byId[p.id] = add;
    total += add;
    if (total >= PHRASE_MATCH_BONUS_CAP) break;
  }
  return { total, byId };
}

export function auxiliaryPenaltyForRow(
  queryNorm: string,
  rowHaystack: string,
): number {
  if (BOQ_AUXILIARY_QUERY_INTENT.test(queryNorm)) return 0;
  if (!BOQ_AUXILIARY_ROW_HINT.test(rowHaystack)) return 0;
  let pen = -AUX_PENALTY_WHEN_QUERY_MAIN_LIKE;
  if (MAIN_FINISHING_WORK_QUERY.test(queryNorm)) {
    pen -= AUX_EXTRA_PENALTY_FINISHING_QUERY;
  }
  return pen;
}

/** Map common ĐVT spellings to a small set of canonical units. */
export function canonicalDonViToken(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "")
    .replace(/m²/g, "m2")
    .replace(/m³/g, "m3")
    .trim();
  if (!s) return null;
  if (s === "m2" || s === "m^2" || s === "m2.") return "m2";
  if (s === "m3" || s === "m^3") return "m3";
  if (s === "md" || s === "1000m") return "md";
  if (s === "kg") return "kg";
  if (s === "tan" || s === "t") return "tan";
  return null;
}

function firstExplicitUnitInQuery(queryNorm: string): string | null {
  const m = queryNorm.match(/\b(m2|m3|md|kg|tan)\b/i);
  if (!m) return null;
  return m[1]!.toLowerCase() as "m2" | "m3" | "md" | "kg" | "tan";
}

/**
 * Small unit-aware nudge when query context is explicit enough.
 * - Explicit unit in query + same ĐVT on row → bonus.
 * - Explicit mismatch → small penalty.
 * - Tiling/finishing context + size token but no unit in query + row m2 → tiny bonus.
 */
export function scoreUnitPreference(
  queryNorm: string,
  donViRaw: string | null | undefined,
): number {
  const rowU = canonicalDonViToken(donViRaw);
  const qU = firstExplicitUnitInQuery(queryNorm);
  if (qU && rowU) {
    if (qU === rowU) return UNIT_MATCH_BONUS;
    return -UNIT_MISMATCH_PENALTY;
  }
  if (
    !qU &&
    TILE_COVERING_CONTEXT.test(queryNorm) &&
    /\b\d{2,4}\s*x\s*\d{2,4}\b/i.test(queryNorm) &&
    rowU === "m2"
  ) {
    return TILING_IMPLIED_M2_BONUS;
  }
  if (
    !qU &&
    EDGING_LINEAR_CONTEXT.test(queryNorm) &&
    TILE_COVERING_CONTEXT.test(queryNorm) &&
    rowU === "md"
  ) {
    return IMPLIED_UNIT_SOFT_BONUS;
  }
  if (!qU && IMPLIED_M3_IN_QUERY.test(queryNorm) && rowU === "m3") {
    return IMPLIED_UNIT_SOFT_BONUS;
  }
  if (
    !qU &&
    EARTHWORK_OR_CONCRETE_VOLUME_CONTEXT.test(queryNorm) &&
    rowU === "m3"
  ) {
    return IMPLIED_UNIT_SOFT_BONUS;
  }
  if (
    !qU &&
    STEEL_BY_WEIGHT_CONTEXT.test(queryNorm) &&
    (rowU === "kg" || rowU === "tan")
  ) {
    return IMPLIED_UNIT_SOFT_BONUS;
  }
  return 0;
}

/*
Manual regression (normalized mentally):
- Query with "op chan tuong" + "porcelain" + "600x100" vs main row "op chan tuong" + "ceramic" + "600x100" + donVi m2
  → phrase bonus, weak dim, material synonyms, implied m2 bonus.
- Auxiliary row "gia cong ... gach" without auxiliary intent in query → auxiliaryPenaltyForRow negative.
*/
