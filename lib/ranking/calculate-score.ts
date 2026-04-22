function includesPhrase(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

/**
 * Canonical match text: same pipeline as search `normalizeQuery` /
 * import `normalizeSearchText`, so query tokens align with DB per-field strings.
 */
function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

/** Max points from weighted per-token overlap (same cap as legacy keyword overlap). */
const TOKEN_OVERLAP_CAP = 50;

const TOKEN_WEIGHT_NOI_DUNG = 1;
const TOKEN_WEIGHT_NHOM = 0.65;
/** Conservative reduction vs 0.45 — less reward for incidental spec hits. */
const TOKEN_WEIGHT_QUY = 0.32;
/** Conservative reduction vs 0.25 — less reward for blob-only hits. */
const TOKEN_WEIGHT_SEARCH_TEXT = 0.14;

const PHRASE_BONUS_NHOM = 5;
const PHRASE_BONUS_QUY = 4;

/** All query tokens appear in noi dung and/or nhóm (primary BOQ fields). */
const PRIMARY_FIELD_COVERAGE_BONUS = 26;

export function calculateScore(
  query: string,
  item: {
    normalizedSearchText: string;
    normalizedNoiDungCongViec?: string | null;
    normalizedNhomCongTac?: string | null;
    normalizedQuyCachKyThuat?: string | null;
  }
) {
  const qNorm = normalizeForMatch(query);
  const tokens = qNorm.split(/\s+/).filter(Boolean);

  let score = 0;
  const breakdown: Record<string, number> = {};

  const noiDung = normalizeForMatch(item.normalizedNoiDungCongViec ?? "");
  const nhom = normalizeForMatch(item.normalizedNhomCongTac ?? "");
  const quy = normalizeForMatch(item.normalizedQuyCachKyThuat ?? "");
  const searchText = normalizeForMatch(item.normalizedSearchText ?? "");

  if (noiDung && includesPhrase(noiDung, qNorm)) {
    score += 40;
    breakdown.exactInWorkContent = 40;
  }

  let tokenOverlapNoiDungCongViec = 0;
  let tokenOverlapNhomCongTac = 0;
  let tokenOverlapQuyCachKyThuat = 0;
  let tokenOverlapSearchText = 0;

  const perTokenBudget = tokens.length > 0 ? TOKEN_OVERLAP_CAP / tokens.length : 0;

  for (const token of tokens) {
    if (noiDung.includes(token)) {
      tokenOverlapNoiDungCongViec += perTokenBudget * TOKEN_WEIGHT_NOI_DUNG;
    } else if (nhom.includes(token)) {
      tokenOverlapNhomCongTac += perTokenBudget * TOKEN_WEIGHT_NHOM;
    } else if (quy.includes(token)) {
      tokenOverlapQuyCachKyThuat += perTokenBudget * TOKEN_WEIGHT_QUY;
    } else if (searchText.includes(token)) {
      tokenOverlapSearchText += perTokenBudget * TOKEN_WEIGHT_SEARCH_TEXT;
    }
  }

  const weightedTokenOverlap =
    tokenOverlapNoiDungCongViec +
    tokenOverlapNhomCongTac +
    tokenOverlapQuyCachKyThuat +
    tokenOverlapSearchText;

  score += weightedTokenOverlap;
  breakdown.tokenOverlapNoiDungCongViec = tokenOverlapNoiDungCongViec;
  breakdown.tokenOverlapNhomCongTac = tokenOverlapNhomCongTac;
  breakdown.tokenOverlapQuyCachKyThuat = tokenOverlapQuyCachKyThuat;
  breakdown.tokenOverlapSearchText = tokenOverlapSearchText;
  breakdown.weightedTokenOverlap = weightedTokenOverlap;

  const primaryFieldCoverage =
    tokens.length > 0 &&
    tokens.every((token) => noiDung.includes(token) || nhom.includes(token));

  if (primaryFieldCoverage) {
    score += PRIMARY_FIELD_COVERAGE_BONUS;
  }
  breakdown.primaryFieldCoverageBonus = primaryFieldCoverage
    ? PRIMARY_FIELD_COVERAGE_BONUS
    : 0;

  if (qNorm.length > 0 && nhom && includesPhrase(nhom, qNorm)) {
    score += PHRASE_BONUS_NHOM;
    breakdown.phraseInNhomCongTac = PHRASE_BONUS_NHOM;
  }

  if (qNorm.length > 0 && quy && includesPhrase(quy, qNorm)) {
    score += PHRASE_BONUS_QUY;
    breakdown.phraseInQuyCachKyThuat = PHRASE_BONUS_QUY;
  }

  let confidenceLabel: "Exact Match" | "Strong Match" | "Near Match" | "Related Match" =
    "Related Match";

  if (score >= 90) confidenceLabel = "Exact Match";
  else if (score >= 75) confidenceLabel = "Strong Match";
  else if (score >= 55) confidenceLabel = "Near Match";

  return { score, confidenceLabel, breakdown };
}
