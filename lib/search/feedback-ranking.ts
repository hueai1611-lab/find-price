import { prisma } from "../db/prisma";
import { normalizeBaseSearchString } from "./boq-search-normalize";
import type { SearchResult } from "./search-types";
import {
  canonicalizeTechnicalText,
  extractCmCapsFromSpec,
} from "./technical-match";

export const FEEDBACK_EXACT_FACTOR = 0.8;
export const FEEDBACK_SIGNATURE_FACTOR = 0.35;
export const FEEDBACK_BOOST_CAP = 10;
export const FEEDBACK_FETCH_LIMIT = 1000;

export type SearchFeedbackAction =
  | "view"
  | "click"
  | "select"
  | "add_to_project"
  | "export"
  | "no_suitable_result";

const ACTION_WEIGHT: Record<SearchFeedbackAction, number> = {
  view: 0.2,
  click: 0.5,
  select: 1,
  add_to_project: 3,
  export: 5,
  no_suitable_result: -1,
};

export function feedbackWeightForAction(action: SearchFeedbackAction): number {
  return ACTION_WEIGHT[action];
}

export function isSearchFeedbackAction(s: string): s is SearchFeedbackAction {
  return (
    s === "view" ||
    s === "click" ||
    s === "select" ||
    s === "add_to_project" ||
    s === "export" ||
    s === "no_suitable_result"
  );
}

export type FeedbackBoostDetail = {
  /** Capped total applied to ranking score. */
  feedbackBoost: number;
  exactFeedbackBoost: number;
  signatureFeedbackBoost: number;
};

function rankMultiplier(selectedRank: number | null | undefined): number {
  if (selectedRank == null) return 1;
  if (selectedRank >= 5) return 1.3;
  if (selectedRank >= 3) return 1.15;
  return 1;
}

function timeDecay(createdAt: Date): number {
  const ageDays = (Date.now() - createdAt.getTime()) / 86_400_000;
  return Math.exp(-ageDays / 60);
}

/**
 * Aggregates recent positive item feedback (exact normalized query + same query signature),
 * with time decay and selected-rank multiplier. Excludes `no_suitable_result` and null `boqItemId`.
 */
export async function getFeedbackBoostDetailMap(
  normalizedQuery: string,
  querySignature: string,
  pricePeriodCode?: string | null
): Promise<Map<string, FeedbackBoostDetail>> {
  const key = normalizedQuery.trim();
  const sig = querySignature.trim();
  if (!key) return new Map();

  const period = pricePeriodCode?.trim() ?? "";

  const orBranches: { normalizedQuery?: string; querySignature?: string }[] = [
    { normalizedQuery: key },
  ];
  if (sig.length > 0) {
    orBranches.push({ querySignature: sig });
  }

  const andParts: object[] = [
    { boqItemId: { not: null } },
    { weight: { gt: 0 } },
    { action: { not: "no_suitable_result" } },
    { OR: orBranches },
  ];
  if (period.length > 0) {
    andParts.push({
      OR: [{ pricePeriodCode: null }, { pricePeriodCode: period }],
    });
  }

  const rows = await prisma.searchFeedback.findMany({
    where: { AND: andParts },
    orderBy: { createdAt: "desc" },
    take: FEEDBACK_FETCH_LIMIT,
    select: {
      boqItemId: true,
      normalizedQuery: true,
      querySignature: true,
      weight: true,
      selectedRank: true,
      createdAt: true,
    },
  });

  const exactSum = new Map<string, number>();
  const sigSum = new Map<string, number>();

  for (const row of rows) {
    const id = row.boqItemId;
    if (!id) continue;
    const decay = timeDecay(row.createdAt);
    const mult = rankMultiplier(row.selectedRank);
    const contrib = row.weight * decay * mult;

    if (row.normalizedQuery === key) {
      exactSum.set(id, (exactSum.get(id) ?? 0) + contrib);
    }
    if (
      sig.length > 0 &&
      row.querySignature === sig &&
      row.normalizedQuery !== key
    ) {
      sigSum.set(id, (sigSum.get(id) ?? 0) + contrib);
    }
  }

  const ids = new Set<string>([...exactSum.keys(), ...sigSum.keys()]);
  const out = new Map<string, FeedbackBoostDetail>();
  for (const id of ids) {
    const exactRaw = (exactSum.get(id) ?? 0) * FEEDBACK_EXACT_FACTOR;
    const sigRaw = (sigSum.get(id) ?? 0) * FEEDBACK_SIGNATURE_FACTOR;
    const combined = Math.min(exactRaw + sigRaw, FEEDBACK_BOOST_CAP);
    if (combined <= 0) continue;
    out.set(id, {
      feedbackBoost: combined,
      exactFeedbackBoost: exactRaw,
      signatureFeedbackBoost: sigRaw,
    });
  }
  return out;
}

/** @deprecated Phase 1 helper — kept for scripts; Phase 2 uses `getFeedbackBoostDetailMap`. */
export function cappedFeedbackBoostFromAggregatedWeight(totalWeight: number): number {
  if (totalWeight <= 0) return 0;
  return Math.min(totalWeight * FEEDBACK_EXACT_FACTOR, FEEDBACK_BOOST_CAP);
}

function smallestQuyCmCapQuy(quy: string | null | undefined): number | null {
  if (!quy) return null;
  const caps = extractCmCapsFromSpec(
    canonicalizeTechnicalText(normalizeBaseSearchString(quy))
  );
  return caps.length ? Math.min(...caps) : null;
}

export function applyFeedbackBoostAndResort(
  results: SearchResult[],
  boostMap: Map<string, FeedbackBoostDetail>,
  queryHasCm: boolean
): SearchResult[] {
  const next = results.map((r) => {
    const detail = boostMap.get(r.itemId);
    const feedbackBoost = detail?.feedbackBoost ?? 0;
    const baseScore = r.score;
    const finalScore = baseScore + feedbackBoost;
    return {
      ...r,
      score: finalScore,
      scoreBreakdown: {
        ...(r.scoreBreakdown ?? {}),
        baseScore,
        feedbackBoost,
        exactFeedbackBoost: detail?.exactFeedbackBoost ?? 0,
        signatureFeedbackBoost: detail?.signatureFeedbackBoost ?? 0,
        finalScore,
      },
    };
  });
  next.sort((a, b) => {
    if (queryHasCm) {
      const ca = smallestQuyCmCapQuy(a.quyCachKyThuat);
      const cb = smallestQuyCmCapQuy(b.quyCachKyThuat);
      if (ca != null && cb != null && ca !== cb) return ca - cb;
      if (ca != null && cb == null) return -1;
      if (ca == null && cb != null) return 1;
    }
    return b.score - a.score;
  });
  return next;
}
