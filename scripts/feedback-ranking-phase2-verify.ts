/**
 * Run: npx tsx scripts/feedback-ranking-phase2-verify.ts
 * Phase 2 feedback rules (no DB for aggregation; Prisma not required).
 */

import assert from "node:assert/strict";

import {
  applyFeedbackBoostAndResort,
  FEEDBACK_BOOST_CAP,
  FEEDBACK_EXACT_FACTOR,
  FEEDBACK_SIGNATURE_FACTOR,
  feedbackWeightForAction,
  isSearchFeedbackAction,
  type FeedbackBoostDetail,
} from "../lib/search/feedback-ranking";
import { buildQuerySignature } from "../lib/search/query-signature";
import type { SearchResult } from "../lib/search/search-types";

function minimalResult(id: string, score: number): SearchResult {
  return {
    itemId: id,
    importBatchId: "b",
    sourceFileName: "f",
    sheetName: "s",
    sourceRowNumber: 1,
    score,
    confidenceLabel: "Related Match",
    noiDungTongHop: "x",
  };
}

const s1 = buildQuerySignature("gach Porcelain KT 600x100");
const s2 = buildQuerySignature("Porcelain gạch 600 x 100");
assert.equal(s1, s2, `signature cluster: "${s1}" vs "${s2}"`);

const sigEmpty = buildQuerySignature("   ");
assert.equal(sigEmpty, "");

// Actions
assert.equal(isSearchFeedbackAction("no_suitable_result"), true);
assert.equal(isSearchFeedbackAction("nope"), false);
assert.equal(feedbackWeightForAction("no_suitable_result"), -1);

// Exact vs signature contribution (same raw weighted sum = 10)
const exactBoost = 10 * FEEDBACK_EXACT_FACTOR;
const sigBoost = 10 * FEEDBACK_SIGNATURE_FACTOR;
assert.ok(exactBoost > sigBoost, "exact channel stronger than signature channel");
assert.equal(Math.min(exactBoost + sigBoost, FEEDBACK_BOOST_CAP), Math.min(8 + 3.5, 10));

// Cap
const map = new Map<string, FeedbackBoostDetail>([
  [
    "x",
    {
      feedbackBoost: FEEDBACK_BOOST_CAP,
      exactFeedbackBoost: 20,
      signatureFeedbackBoost: 20,
    },
  ],
]);
const one = applyFeedbackBoostAndResort([minimalResult("x", 0)], map, false)[0]!;
assert.equal(one.score, FEEDBACK_BOOST_CAP);
assert.equal(one.scoreBreakdown?.feedbackBoost, FEEDBACK_BOOST_CAP);

// Ghost id not in results
const two = applyFeedbackBoostAndResort(
  [minimalResult("a", 1), minimalResult("b", 2)],
  new Map([["ghost", { feedbackBoost: 50, exactFeedbackBoost: 50, signatureFeedbackBoost: 0 }]]),
  false
);
assert.ok(!two.some((r) => r.itemId === "ghost"));

// Negative weight would be excluded from DB query (weight > 0); document:
assert.ok(feedbackWeightForAction("no_suitable_result") < 0);

// Rank multiplier (mirrors ranking module)
function rankMult(rank: number | null) {
  if (rank == null) return 1;
  if (rank >= 5) return 1.3;
  if (rank >= 3) return 1.15;
  return 1;
}
assert.equal(rankMult(5), 1.3);
assert.equal(rankMult(3), 1.15);
assert.equal(rankMult(2), 1);

// Time decay older = smaller
function decay(ageDays: number) {
  return Math.exp(-ageDays / 60);
}
assert.ok(decay(0) > decay(120));

// Breakdown keys present
const d = applyFeedbackBoostAndResort(
  [minimalResult("a", 10)],
  new Map([["a", { feedbackBoost: 2, exactFeedbackBoost: 1.5, signatureFeedbackBoost: 0.5 }]]),
  false
)[0]!;
assert.equal(d.scoreBreakdown?.exactFeedbackBoost, 1.5);
assert.equal(d.scoreBreakdown?.signatureFeedbackBoost, 0.5);
assert.equal(d.scoreBreakdown?.finalScore, 12);

console.log("feedback-ranking-phase2-verify: ok");
