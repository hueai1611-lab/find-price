/**
 * Run: npx tsx scripts/feedback-ranking-verify.ts
 * Lightweight checks (no DB) for feedback normalization and boost math.
 */

import assert from "node:assert/strict";

import { normalizeSearchQuery } from "../lib/search/feedback-query-normalize";
import { normalizeFeedbackLookupKey } from "../lib/search/feedback-lookup-key";
import {
  applyFeedbackBoostAndResort,
  cappedFeedbackBoostFromAggregatedWeight,
  FEEDBACK_BOOST_CAP,
  isSearchFeedbackAction,
  type FeedbackBoostDetail,
} from "../lib/search/feedback-ranking";
import type { SearchResult } from "../lib/search/search-types";

function minimalResult(
  id: string,
  score: number,
  overrides: Partial<SearchResult> = {}
): SearchResult {
  return {
    itemId: id,
    importBatchId: "b",
    sourceFileName: "f",
    sheetName: "s",
    sourceRowNumber: 1,
    score,
    confidenceLabel: "Related Match",
    noiDungTongHop: "x",
    ...overrides,
  };
}

// normalizeSearchQuery keeps Vietnamese letters (not ASCII-stripped)
const qVi = normalizeSearchQuery("  Đá  op lat  ");
assert.match(qVi, /đá/, "Vietnamese đ preserved after lowercasing");

// Technical-ish tokens survive light pass (hyphen kept)
const qTech = normalizeSearchQuery("  cb400-v  d400  ");
assert.ok(qTech.includes("cb400-v") || qTech.includes("cb400"), "grade token largely intact");
assert.ok(qTech.includes("d400"), "d400 preserved");

// Lookup key aligns with search pipeline (ASCII)
const key = normalizeFeedbackLookupKey("Chậu rửa");
assert.ok(/\bchau\b/i.test(key), `lookup key is ASCII-normalized: ${key}`);

// Cap
assert.equal(cappedFeedbackBoostFromAggregatedWeight(0), 0);
assert.equal(cappedFeedbackBoostFromAggregatedWeight(1), 0.8);
assert.equal(cappedFeedbackBoostFromAggregatedWeight(100), FEEDBACK_BOOST_CAP);

// Invalid action
assert.equal(isSearchFeedbackAction("select"), true);
assert.equal(isSearchFeedbackAction("bogus"), false);

// Boost reorder: only items in list get boost; unrelated id in map ignored for missing rows
const detail = (b: number, e = b, s = 0): FeedbackBoostDetail => ({
  feedbackBoost: b,
  exactFeedbackBoost: e,
  signatureFeedbackBoost: s,
});
const map = new Map<string, FeedbackBoostDetail>([
  ["a", detail(5, 5, 0)],
  ["ghost", detail(99, 99, 0)],
]);
const list = [
  minimalResult("a", 10),
  minimalResult("b", 12),
];
const out = applyFeedbackBoostAndResort(list, map, false);
const a = out.find((r) => r.itemId === "a")!;
const b = out.find((r) => r.itemId === "b")!;
assert.equal(a.scoreBreakdown?.feedbackBoost, 5);
assert.equal(a.score, 15);
assert.equal(b.scoreBreakdown?.feedbackBoost, 0);
assert.equal(b.score, 12);
assert.ok(out[0].itemId === "a", "boosted row sorts first when ahead after boost");

console.log("feedback-ranking-verify: ok");
