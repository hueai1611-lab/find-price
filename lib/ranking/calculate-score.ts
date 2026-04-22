import {
  canonicalizeTechnicalText,
  cmQueryFitsSpecCaps,
  diameterQueryContainedInSpec,
  extractCmValuesFromQuery,
  extractDiameterTokens,
  isTechnicalSearchToken,
  nearestCmThresholdBonusFromSpec,
} from "../search/technical-match";

/** Keep in sync with lib/search/search-service `normalizeTechnicalForms`. */
function normalizeTechnicalForms(s: string): string {
  return s
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\b(\d+)\s+cm\b/gi, "$1cm")
    .replace(/\bD\s*(\d+)\b/gi, "D$1")
    .replace(/\bD(\d+)\s*-\s*D(\d+)\b/gi, "D$1-D$2");
}

/**
 * Canonical match text: same pipeline as search `normalizeQuery` /
 * import `normalizeSearchText`, so query tokens align with DB per-field strings.
 */
function normalizeForMatch(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
  return normalizeTechnicalForms(base);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Simple normalized word: letters+digits only — require whole-token match so
 * "pha" does not match inside "phat".
 */
const SIMPLE_LEXICAL_TOKEN = /^[a-z0-9]+$/i;

function tokenMatchesInHaystack(haystack: string, token: string): boolean {
  if (!haystack || !token) return false;
  if (SIMPLE_LEXICAL_TOKEN.test(token)) {
    const re = new RegExp(
      `(?:^|[^a-z0-9])${escapeRegExp(token)}(?=$|[^a-z0-9])`,
      "i"
    );
    return re.test(haystack);
  }
  /** Technical / punctuation / mixed forms: <=20cm, D500-D600, d10, etc. */
  return haystack.includes(token);
}

/** Consecutive tokens as one phrase: non-word boundaries at edges, \\s+ between tokens. */
function phraseMatchesInHaystack(haystack: string, fragment: string[]): boolean {
  if (!haystack || fragment.length === 0) return false;
  const inner = fragment.map((t) => escapeRegExp(t)).join("\\s+");
  const re = new RegExp(`(?:^|[^a-z0-9])${inner}(?=$|[^a-z0-9])`, "i");
  return re.test(haystack);
}

/** Longest prefix of query tokens that matches as a word-aware phrase in haystack. */
function longestPrefixTokenCount(tokens: string[], haystack: string): number {
  for (let len = tokens.length; len >= 1; len--) {
    const frag = tokens.slice(0, len);
    if (phraseMatchesInHaystack(haystack, frag)) {
      return len;
    }
  }
  return 0;
}

/** Max points from weighted per-token overlap (same cap as legacy keyword overlap). */
const TOKEN_OVERLAP_CAP = 50;

const TOKEN_WEIGHT_NOI_DUNG = 1;
const TOKEN_WEIGHT_NHOM = 0.65;
const TOKEN_WEIGHT_QUY = 0.38;
/** Secondary: Yêu cầu khác only (below quy). */
const TOKEN_WEIGHT_YEU_CAU_KHAC = 0.11;
/** Last-resort blob (ĐVT, mã, residual); weaker than primary + yeu. */
const TOKEN_WEIGHT_SEARCH_TEXT = 0.05;

const PHRASE_BONUS_NHOM = 5;
const PHRASE_BONUS_QUY = 4;
const PHRASE_BONUS_YEU_CAU_KHAC = 2;

/** All query tokens appear in noi dung and/or nhóm and/or quy cách (primary three). */
const PRIMARY_FIELD_COVERAGE_BONUS = 26;

/** Prefix of query tokens lies in nhóm and remainder lies in quy cách (composite BOQ intent). */
const COMPOSITE_NHOM_QUY_BONUS = 22;

/**
 * Nearest valid <=…cm tier: bonus = max(0, maxBonus - (tierCap - v)),
 * tierCap = smallest parsed cap with v <= cap. Lexical, deterministic.
 */
const NEAREST_CM_THRESHOLD_BONUS_MAX = 24;

export function calculateScore(
  query: string,
  item: {
    normalizedSearchText: string;
    normalizedNoiDungCongViec?: string | null;
    normalizedNhomCongTac?: string | null;
    normalizedQuyCachKyThuat?: string | null;
    normalizedYeuCauKhac?: string | null;
  }
) {
  const qNorm = normalizeForMatch(query);
  const tokens = qNorm.split(/\s+/).filter(Boolean);
  const qCanon = canonicalizeTechnicalText(qNorm);
  const hasCmQuery = extractCmValuesFromQuery(qCanon).length > 0;
  const hasDiameterQuery = extractDiameterTokens(qCanon).length > 0;

  let score = 0;
  const breakdown: Record<string, number> = {};

  const noiDung = normalizeForMatch(item.normalizedNoiDungCongViec ?? "");
  const nhom = normalizeForMatch(item.normalizedNhomCongTac ?? "");
  const quy = normalizeForMatch(item.normalizedQuyCachKyThuat ?? "");
  const yeuCau = normalizeForMatch(item.normalizedYeuCauKhac ?? "");
  const searchText = normalizeForMatch(item.normalizedSearchText ?? "");
  const specCanon = canonicalizeTechnicalText(
    [noiDung, nhom, quy, yeuCau].filter(Boolean).join(" ")
  );
  const cmFitsSpec = hasCmQuery && cmQueryFitsSpecCaps(qCanon, specCanon);
  const diameterFitsSpec =
    hasDiameterQuery && diameterQueryContainedInSpec(qCanon, specCanon);

  if (noiDung && tokens.length > 0 && phraseMatchesInHaystack(noiDung, tokens)) {
    score += 40;
    breakdown.exactInWorkContent = 40;
  }

  let tokenOverlapNoiDungCongViec = 0;
  let tokenOverlapNhomCongTac = 0;
  let tokenOverlapQuyCachKyThuat = 0;
  let tokenOverlapYeuCauKhac = 0;
  let tokenOverlapSearchText = 0;

  const perTokenBudget = tokens.length > 0 ? TOKEN_OVERLAP_CAP / tokens.length : 0;

  for (const token of tokens) {
    if (isTechnicalSearchToken(token)) {
      if (/^\d+cm$/i.test(token) && hasCmQuery && cmFitsSpec) {
        tokenOverlapQuyCachKyThuat += perTokenBudget * TOKEN_WEIGHT_QUY;
      } else if (/^d\d/i.test(token) && hasDiameterQuery && diameterFitsSpec) {
        tokenOverlapQuyCachKyThuat += perTokenBudget * TOKEN_WEIGHT_QUY;
      } else if (tokenMatchesInHaystack(noiDung, token)) {
        tokenOverlapNoiDungCongViec += perTokenBudget * TOKEN_WEIGHT_NOI_DUNG;
      } else if (tokenMatchesInHaystack(nhom, token)) {
        tokenOverlapNhomCongTac += perTokenBudget * TOKEN_WEIGHT_NHOM;
      } else if (tokenMatchesInHaystack(quy, token)) {
        tokenOverlapQuyCachKyThuat += perTokenBudget * TOKEN_WEIGHT_QUY;
      } else if (tokenMatchesInHaystack(yeuCau, token)) {
        tokenOverlapYeuCauKhac += perTokenBudget * TOKEN_WEIGHT_YEU_CAU_KHAC;
      } else if (tokenMatchesInHaystack(searchText, token)) {
        tokenOverlapSearchText += perTokenBudget * TOKEN_WEIGHT_SEARCH_TEXT;
      }
    } else if (tokenMatchesInHaystack(noiDung, token)) {
      tokenOverlapNoiDungCongViec += perTokenBudget * TOKEN_WEIGHT_NOI_DUNG;
    } else if (tokenMatchesInHaystack(nhom, token)) {
      tokenOverlapNhomCongTac += perTokenBudget * TOKEN_WEIGHT_NHOM;
    } else if (tokenMatchesInHaystack(quy, token)) {
      tokenOverlapQuyCachKyThuat += perTokenBudget * TOKEN_WEIGHT_QUY;
    } else if (tokenMatchesInHaystack(yeuCau, token)) {
      tokenOverlapYeuCauKhac += perTokenBudget * TOKEN_WEIGHT_YEU_CAU_KHAC;
    } else if (tokenMatchesInHaystack(searchText, token)) {
      tokenOverlapSearchText += perTokenBudget * TOKEN_WEIGHT_SEARCH_TEXT;
    }
  }

  const weightedTokenOverlap =
    tokenOverlapNoiDungCongViec +
    tokenOverlapNhomCongTac +
    tokenOverlapQuyCachKyThuat +
    tokenOverlapYeuCauKhac +
    tokenOverlapSearchText;

  score += weightedTokenOverlap;
  breakdown.tokenOverlapNoiDungCongViec = tokenOverlapNoiDungCongViec;
  breakdown.tokenOverlapNhomCongTac = tokenOverlapNhomCongTac;
  breakdown.tokenOverlapQuyCachKyThuat = tokenOverlapQuyCachKyThuat;
  breakdown.tokenOverlapYeuCauKhac = tokenOverlapYeuCauKhac;
  breakdown.tokenOverlapSearchText = tokenOverlapSearchText;
  breakdown.weightedTokenOverlap = weightedTokenOverlap;

  const lexicalTokens = tokens.filter((t) => !isTechnicalSearchToken(t));
  const technicalSatisfied =
    (!hasCmQuery || cmFitsSpec) && (!hasDiameterQuery || diameterFitsSpec);
  const primaryFieldCoverage =
    tokens.length > 0 &&
    technicalSatisfied &&
    (lexicalTokens.length === 0
      ? hasCmQuery || hasDiameterQuery
      : lexicalTokens.every(
          (token) =>
            tokenMatchesInHaystack(noiDung, token) ||
            tokenMatchesInHaystack(nhom, token) ||
            tokenMatchesInHaystack(quy, token)
        ));

  if (primaryFieldCoverage) {
    score += PRIMARY_FIELD_COVERAGE_BONUS;
  }
  breakdown.primaryFieldCoverageBonus = primaryFieldCoverage
    ? PRIMARY_FIELD_COVERAGE_BONUS
    : 0;

  let nearestCmThresholdBonus = 0;
  if (hasCmQuery && cmFitsSpec) {
    const qCm = extractCmValuesFromQuery(qCanon);
    const v = Math.max(...qCm);
    nearestCmThresholdBonus = nearestCmThresholdBonusFromSpec(
      v,
      specCanon,
      NEAREST_CM_THRESHOLD_BONUS_MAX
    );
    score += nearestCmThresholdBonus;
  }
  breakdown.nearestCmThresholdBonus = nearestCmThresholdBonus;

  const prefixLenInNhom = longestPrefixTokenCount(tokens, nhom);
  let compositeNhomQuyMatch = 0;
  if (
    prefixLenInNhom > 0 &&
    prefixLenInNhom < tokens.length &&
    quy.length > 0
  ) {
    const remainderTokens = tokens.slice(prefixLenInNhom);
    if (
      remainderTokens.length > 0 &&
      phraseMatchesInHaystack(quy, remainderTokens)
    ) {
      compositeNhomQuyMatch = COMPOSITE_NHOM_QUY_BONUS;
      score += COMPOSITE_NHOM_QUY_BONUS;
    }
  }
  breakdown.compositeNhomQuyMatch = compositeNhomQuyMatch;

  if (qNorm.length > 0 && nhom && phraseMatchesInHaystack(nhom, tokens)) {
    score += PHRASE_BONUS_NHOM;
    breakdown.phraseInNhomCongTac = PHRASE_BONUS_NHOM;
  }

  if (qNorm.length > 0 && quy && phraseMatchesInHaystack(quy, tokens)) {
    score += PHRASE_BONUS_QUY;
    breakdown.phraseInQuyCachKyThuat = PHRASE_BONUS_QUY;
  }

  if (qNorm.length > 0 && yeuCau && phraseMatchesInHaystack(yeuCau, tokens)) {
    score += PHRASE_BONUS_YEU_CAU_KHAC;
    breakdown.phraseInYeuCauKhac = PHRASE_BONUS_YEU_CAU_KHAC;
  }

  let confidenceLabel: "Exact Match" | "Strong Match" | "Near Match" | "Related Match" =
    "Related Match";

  if (score >= 90) confidenceLabel = "Exact Match";
  else if (score >= 75) confidenceLabel = "Strong Match";
  else if (score >= 55) confidenceLabel = "Near Match";

  return { score, confidenceLabel, breakdown };
}
