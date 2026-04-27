import {
  BOQ_MATERIAL_TOKENS,
  BOQ_STRUCTURAL_TOKENS,
  BOQ_VERB_EXECUTION,
  BOQ_VERB_SUPPLY,
} from "../search/boq-synonym-dictionary";
import { collectQuerySearchTokens } from "../search/boq-search-expand";
import { applyBoqDiameterCanonicalForms } from "../search/boq-diameter-normalize";
import { normalizeBaseSearchString } from "../search/boq-search-normalize";
import {
  dualSidePhrasesMatchedOnQuery,
  synonymGroupsMatchedOnQuery,
} from "../search/boq-scoring-debug";
import {
  auxiliaryPenaltyForRow,
  scoreDualSideConstructionPhrases,
  scoreUnitPreference,
  scoreWeakDimensionOverlap,
} from "../search/boq-ranking-signals";
import { scoreObjectDomainCompatibility } from "../search/boq-object-semantic";
import {
  BOQ_WEAK_TOKEN_OVERLAP_MULTIPLIER,
  isBoqWeakScoringToken,
} from "../search/boq-weak-tokens";
import {
  canonicalizeTechnicalText,
  cmQueryFitsSpecCaps,
  diameterQueryContainedInSpec,
  extractCmValuesFromQuery,
  extractDiameterTokens,
  isTechnicalSearchToken,
  nearestCmThresholdBonusFromSpec,
} from "../search/technical-match";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  return haystack.includes(token);
}

function phraseMatchesInHaystack(haystack: string, fragment: string[]): boolean {
  if (!haystack || fragment.length === 0) return false;
  const inner = fragment.map((t) => escapeRegExp(t)).join("\\s+");
  const re = new RegExp(`(?:^|[^a-z0-9])${inner}(?=$|[^a-z0-9])`, "i");
  return re.test(haystack);
}

function longestPrefixTokenCount(tokens: string[], haystack: string): number {
  for (let len = tokens.length; len >= 1; len--) {
    const frag = tokens.slice(0, len);
    if (phraseMatchesInHaystack(haystack, frag)) {
      return len;
    }
  }
  return 0;
}

const TOKEN_OVERLAP_CAP = 50;

const TOKEN_WEIGHT_NOI_DUNG = 1;
const TOKEN_WEIGHT_NHOM = 0.65;
const TOKEN_WEIGHT_QUY = 0.38;
const TOKEN_WEIGHT_EXPANSION = 0.32;
const TOKEN_WEIGHT_YEU_CAU_KHAC = 0.11;
const TOKEN_WEIGHT_SEARCH_TEXT = 0.05;

const PHRASE_BONUS_NHOM = 5;
const PHRASE_BONUS_QUY = 4;
const PHRASE_BONUS_YEU_CAU_KHAC = 2;

const PRIMARY_FIELD_COVERAGE_BONUS = 26;
const COMPOSITE_NHOM_QUY_BONUS = 22;
const NEAREST_CM_THRESHOLD_BONUS_MAX = 24;

/** Single shot when d… query matches spec. */
const DIAMETER_SPEC_MATCH_BONUS = 14;
const MATERIAL_TERM_BONUS_MAX = 10;
const STRUCTURAL_OBJECT_BONUS_MAX = 6;
const SUPPLY_VS_EXEC_VERB_PENALTY = 4;

export type BoqScoreDebugInfo = {
  normalizedQuery: string;
  normalizedHaystackPreview: string;
  synonymGroupsMatched: ReturnType<typeof synonymGroupsMatchedOnQuery>;
  phrasesMatchedOnQuery: ReturnType<typeof dualSidePhrasesMatchedOnQuery>;
  matchedPhrasesDualSide: { id: string; bonus: number }[];
  weakDimensionOverlapBonus: number;
  auxiliaryRowPenalty: number;
  unitPreferenceAdjustment: number;
  /** Object / domain layer (sanitary vs stone supporting work). */
  queryObjectDomain?: string;
  rowObjectDomain?: string;
  objectCompatibilityScore?: number;
  rowWorkIntent?: string;
  queryWorkIntent?: string;
  auxiliaryPenalty?: number;
  objectStrongConflict?: boolean;
  finalScore: number;
};

export type CalculateScoreOptions = {
  /** When true (e.g. `DEBUG_BOQ_SCORING=1`), attach structured debug for top-result inspection. */
  includeDebug?: boolean;
};

export type CalculateScoreResult = {
  score: number;
  confidenceLabel: "Exact Match" | "Strong Match" | "Near Match" | "Related Match";
  breakdown: Record<string, number>;
  debug?: BoqScoreDebugInfo;
};

function scoreStructuralHits(tokens: string[], primaryPlusExpansion: string): number {
  let acc = 0;
  for (const t of BOQ_STRUCTURAL_TOKENS) {
    if (!tokens.includes(t)) continue;
    if (tokenMatchesInHaystack(primaryPlusExpansion, t)) {
      acc = Math.min(STRUCTURAL_OBJECT_BONUS_MAX, acc + 1.5);
    }
  }
  return acc;
}

function scoreMaterialHits(tokens: string[], primaryPlusExpansion: string): number {
  let acc = 0;
  for (const t of BOQ_MATERIAL_TOKENS) {
    if (!tokens.includes(t)) continue;
    if (tokenMatchesInHaystack(primaryPlusExpansion, t)) {
      acc = Math.min(MATERIAL_TERM_BONUS_MAX, acc + 2);
    }
  }
  return acc;
}

export function calculateScore(
  query: string,
  item: {
    normalizedSearchText: string;
    normalizedNoiDungCongViec?: string | null;
    normalizedNhomCongTac?: string | null;
    normalizedQuyCachKyThuat?: string | null;
    normalizedYeuCauKhac?: string | null;
    normalizedExpansionSearchText?: string | null;
    /** ĐVT — optional unit-aware ranking only when query signal is strong enough. */
    donVi?: string | null;
  },
  options?: CalculateScoreOptions
): CalculateScoreResult {
  const qNorm = normalizeBaseSearchString(query);
  /** Conjunctive + synonym aliases for overlap / primary coverage. */
  const tokens = collectQuerySearchTokens(qNorm);
  /** Original word order (no extra synonym appends) for phrase-style bonuses. */
  const queryTokensInOrder = qNorm.split(/\s+/).filter((t) => t.length > 0);
  const qCanon = canonicalizeTechnicalText(qNorm);
  const hasCmQuery = extractCmValuesFromQuery(qCanon).length > 0;
  const hasDiameterQuery = extractDiameterTokens(qCanon).length > 0;

  let score = 0;
  const breakdown: Record<string, number> = {};

  const noiDung = normalizeBaseSearchString(item.normalizedNoiDungCongViec ?? "");
  const nhom = normalizeBaseSearchString(item.normalizedNhomCongTac ?? "");
  const quy = normalizeBaseSearchString(item.normalizedQuyCachKyThuat ?? "");
  const yeuCau = normalizeBaseSearchString(item.normalizedYeuCauKhac ?? "");
  const searchText = normalizeBaseSearchString(item.normalizedSearchText ?? "");
  const expansion = normalizeBaseSearchString(item.normalizedExpansionSearchText ?? "");

  const primaryPlusExpansion = [noiDung, nhom, quy, expansion].filter(Boolean).join(" ");
  const specCanon = canonicalizeTechnicalText(
    applyBoqDiameterCanonicalForms(
      [noiDung, nhom, quy, yeuCau].filter(Boolean).join(" ")
    )
  );
  const cmFitsSpec = hasCmQuery && cmQueryFitsSpecCaps(qCanon, specCanon);
  const diameterFitsSpec =
    hasDiameterQuery && diameterQueryContainedInSpec(qCanon, specCanon);

  const exactPhraseHit =
    noiDung &&
    queryTokensInOrder.length > 0 &&
    phraseMatchesInHaystack(noiDung, queryTokensInOrder);
  if (exactPhraseHit) {
    score += 40;
    breakdown.exactInWorkContent = 40;
  }

  let tokenOverlapNoiDungCongViec = 0;
  let tokenOverlapNhomCongTac = 0;
  let tokenOverlapQuyCachKyThuat = 0;
  let tokenOverlapExpansion = 0;
  let tokenOverlapYeuCauKhac = 0;
  let tokenOverlapSearchText = 0;

  const perTokenBudget = tokens.length > 0 ? TOKEN_OVERLAP_CAP / tokens.length : 0;

  const countToken = (token: string) => {
    const w = isBoqWeakScoringToken(token) ? BOQ_WEAK_TOKEN_OVERLAP_MULTIPLIER : 1;
    const budget = perTokenBudget * w;
    if (isTechnicalSearchToken(token)) {
      if (/^\d+cm$/i.test(token) && hasCmQuery && cmFitsSpec) {
        tokenOverlapQuyCachKyThuat += budget * TOKEN_WEIGHT_QUY;
      } else if (/^d\d/i.test(token) && hasDiameterQuery && diameterFitsSpec) {
        tokenOverlapQuyCachKyThuat += budget * TOKEN_WEIGHT_QUY;
      } else if (tokenMatchesInHaystack(noiDung, token)) {
        tokenOverlapNoiDungCongViec += budget * TOKEN_WEIGHT_NOI_DUNG;
      } else if (tokenMatchesInHaystack(nhom, token)) {
        tokenOverlapNhomCongTac += budget * TOKEN_WEIGHT_NHOM;
      } else if (tokenMatchesInHaystack(quy, token)) {
        tokenOverlapQuyCachKyThuat += budget * TOKEN_WEIGHT_QUY;
      } else if (tokenMatchesInHaystack(expansion, token)) {
        tokenOverlapExpansion += budget * TOKEN_WEIGHT_EXPANSION;
      } else if (tokenMatchesInHaystack(yeuCau, token)) {
        tokenOverlapYeuCauKhac += budget * TOKEN_WEIGHT_YEU_CAU_KHAC;
      } else if (tokenMatchesInHaystack(searchText, token)) {
        tokenOverlapSearchText += budget * TOKEN_WEIGHT_SEARCH_TEXT;
      }
    } else if (tokenMatchesInHaystack(noiDung, token)) {
      tokenOverlapNoiDungCongViec += budget * TOKEN_WEIGHT_NOI_DUNG;
    } else if (tokenMatchesInHaystack(nhom, token)) {
      tokenOverlapNhomCongTac += budget * TOKEN_WEIGHT_NHOM;
    } else if (tokenMatchesInHaystack(quy, token)) {
      tokenOverlapQuyCachKyThuat += budget * TOKEN_WEIGHT_QUY;
    } else if (tokenMatchesInHaystack(expansion, token)) {
      tokenOverlapExpansion += budget * TOKEN_WEIGHT_EXPANSION;
    } else if (tokenMatchesInHaystack(yeuCau, token)) {
      tokenOverlapYeuCauKhac += budget * TOKEN_WEIGHT_YEU_CAU_KHAC;
    } else if (tokenMatchesInHaystack(searchText, token)) {
      tokenOverlapSearchText += budget * TOKEN_WEIGHT_SEARCH_TEXT;
    }
  };

  for (const token of tokens) {
    countToken(token);
  }

  const weightedTokenOverlap =
    tokenOverlapNoiDungCongViec +
    tokenOverlapNhomCongTac +
    tokenOverlapQuyCachKyThuat +
    tokenOverlapExpansion +
    tokenOverlapYeuCauKhac +
    tokenOverlapSearchText;

  score += weightedTokenOverlap;
  breakdown.tokenOverlapNoiDungCongViec = tokenOverlapNoiDungCongViec;
  breakdown.tokenOverlapNhomCongTac = tokenOverlapNhomCongTac;
  breakdown.tokenOverlapQuyCachKyThuat = tokenOverlapQuyCachKyThuat;
  breakdown.tokenOverlapExpansion = tokenOverlapExpansion;
  breakdown.tokenOverlapYeuCauKhac = tokenOverlapYeuCauKhac;
  breakdown.tokenOverlapSearchText = tokenOverlapSearchText;
  breakdown.weightedTokenOverlap = weightedTokenOverlap;

  const structuralBonus = scoreStructuralHits(tokens, primaryPlusExpansion);
  if (structuralBonus > 0) {
    score += structuralBonus;
  }
  breakdown.boqStructuralObjectBonus = structuralBonus;

  const materialBonus = scoreMaterialHits(tokens, primaryPlusExpansion);
  if (materialBonus > 0) {
    score += materialBonus;
  }
  breakdown.boqMaterialTermBonus = materialBonus;

  if (hasDiameterQuery && diameterFitsSpec) {
    score += DIAMETER_SPEC_MATCH_BONUS;
  }
  breakdown.diameterSpecMatchBonus = hasDiameterQuery && diameterFitsSpec
    ? DIAMETER_SPEC_MATCH_BONUS
    : 0;

  const weakDim = scoreWeakDimensionOverlap(qNorm, primaryPlusExpansion);
  if (weakDim > 0) {
    score += weakDim;
  }
  breakdown.weakDimensionOverlapBonus = weakDim;

  const phraseSig = scoreDualSideConstructionPhrases(qNorm, primaryPlusExpansion);
  if (phraseSig.total > 0) {
    score += phraseSig.total;
  }
  breakdown.constructionPhraseBonus = phraseSig.total;
  for (const [id, v] of Object.entries(phraseSig.byId)) {
    breakdown[`phrase_${id}`] = v;
  }

  const auxPen = auxiliaryPenaltyForRow(qNorm, primaryPlusExpansion);
  if (auxPen !== 0) {
    score += auxPen;
  }
  breakdown.auxiliaryRowPenalty = auxPen;

  const objectSig = scoreObjectDomainCompatibility(qNorm, {
    nhom,
    noiDung,
    quy,
  });
  if (objectSig.delta !== 0) {
    score += objectSig.delta;
  }
  breakdown.objectCompatibilityScore = objectSig.delta;

  const unitAdj = scoreUnitPreference(qNorm, item.donVi);
  if (unitAdj !== 0) {
    score += unitAdj;
  }
  breakdown.unitPreferenceAdjustment = unitAdj;

  const noidungJoinForVerb = [noiDung, nhom, quy].filter(Boolean).join(" ");
  if (BOQ_VERB_EXECUTION.test(qNorm) && BOQ_VERB_SUPPLY.test(noidungJoinForVerb)) {
    score -= SUPPLY_VS_EXEC_VERB_PENALTY;
    breakdown.supplyVsExecVerbPenalty = -SUPPLY_VS_EXEC_VERB_PENALTY;
  } else {
    breakdown.supplyVsExecVerbPenalty = 0;
  }

  const lexicalTokens = tokens.filter((t) => !isTechnicalSearchToken(t));
  const strongLexical = lexicalTokens.filter((t) => !isBoqWeakScoringToken(t));
  const lexicalForCoverage =
    strongLexical.length > 0 ? strongLexical : lexicalTokens;
  const technicalSatisfied =
    (!hasCmQuery || cmFitsSpec) && (!hasDiameterQuery || diameterFitsSpec);
  const primaryFieldCoverage =
    tokens.length > 0 &&
    technicalSatisfied &&
    (lexicalForCoverage.length === 0
      ? hasCmQuery || hasDiameterQuery
      : lexicalForCoverage.every(
          (token) =>
            tokenMatchesInHaystack(noiDung, token) ||
            tokenMatchesInHaystack(nhom, token) ||
            tokenMatchesInHaystack(quy, token) ||
            tokenMatchesInHaystack(expansion, token)
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

  const prefixLenInNhom = longestPrefixTokenCount(queryTokensInOrder, nhom);
  let compositeNhomQuyMatch = 0;
  if (
    prefixLenInNhom > 0 &&
    prefixLenInNhom < queryTokensInOrder.length &&
    quy.length > 0
  ) {
    const remainderTokens = queryTokensInOrder.slice(prefixLenInNhom);
    if (
      remainderTokens.length > 0 &&
      phraseMatchesInHaystack(quy, remainderTokens)
    ) {
      compositeNhomQuyMatch = COMPOSITE_NHOM_QUY_BONUS;
      score += COMPOSITE_NHOM_QUY_BONUS;
    }
  }
  breakdown.compositeNhomQuyMatch = compositeNhomQuyMatch;

  if (qNorm.length > 0 && nhom && phraseMatchesInHaystack(nhom, queryTokensInOrder)) {
    score += PHRASE_BONUS_NHOM;
    breakdown.phraseInNhomCongTac = PHRASE_BONUS_NHOM;
  }

  if (qNorm.length > 0 && quy && phraseMatchesInHaystack(quy, queryTokensInOrder)) {
    score += PHRASE_BONUS_QUY;
    breakdown.phraseInQuyCachKyThuat = PHRASE_BONUS_QUY;
  }

  if (qNorm.length > 0 && yeuCau && phraseMatchesInHaystack(yeuCau, queryTokensInOrder)) {
    score += PHRASE_BONUS_YEU_CAU_KHAC;
    breakdown.phraseInYeuCauKhac = PHRASE_BONUS_YEU_CAU_KHAC;
  }

  let confidenceLabel: "Exact Match" | "Strong Match" | "Near Match" | "Related Match" =
    "Related Match";

  if (score >= 90) confidenceLabel = "Exact Match";
  else if (score >= 75) confidenceLabel = "Strong Match";
  else if (score >= 55) confidenceLabel = "Near Match";

  if (objectSig.strongConflict) {
    confidenceLabel = "Related Match";
  } else if (objectSig.delta <= -48) {
    if (confidenceLabel === "Exact Match" || confidenceLabel === "Strong Match") {
      confidenceLabel = "Near Match";
    }
  }

  const out: CalculateScoreResult = { score, confidenceLabel, breakdown };
  if (options?.includeDebug) {
    out.debug = {
      normalizedQuery: qNorm,
      normalizedHaystackPreview: primaryPlusExpansion.slice(0, 2000),
      synonymGroupsMatched: synonymGroupsMatchedOnQuery(qNorm),
      phrasesMatchedOnQuery: dualSidePhrasesMatchedOnQuery(qNorm),
      matchedPhrasesDualSide: Object.entries(phraseSig.byId).map(([id, bonus]) => ({
        id,
        bonus,
      })),
      weakDimensionOverlapBonus: weakDim,
      auxiliaryRowPenalty: auxPen,
      unitPreferenceAdjustment: unitAdj,
      queryObjectDomain: objectSig.queryLabel,
      rowObjectDomain: objectSig.rowLabel,
      objectCompatibilityScore: objectSig.delta,
      rowWorkIntent: objectSig.rowWorkIntent,
      queryWorkIntent: objectSig.queryWorkIntent,
      auxiliaryPenalty: auxPen,
      objectStrongConflict: objectSig.strongConflict,
      finalScore: score,
    };
  }
  return out;
}
