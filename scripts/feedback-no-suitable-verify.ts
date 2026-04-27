/**
 * Run: npx tsx scripts/feedback-no-suitable-verify.ts
 * Requires DATABASE_URL and applied migrations (search_feedback + virtualCandidateKey).
 */

import "dotenv/config";
import assert from "node:assert/strict";

import { prisma } from "../lib/db/prisma";
import {
  buildSearchFeedbackMeta,
  getNoSuitableSignal,
  isReservedVirtualFeedbackBoqId,
  VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
} from "../lib/search/feedback-no-suitable-signal";
import {
  getMainSearchRowDisplay,
  pickMainTableTop,
} from "../lib/search/display-result-order";
import { getLatestSearchSelectionForRawQuery } from "../lib/search/feedback-latest-selection";
import { normalizeFeedbackLookupKey } from "../lib/search/feedback-lookup-key";
import { getFeedbackBoostDetailMap } from "../lib/search/feedback-ranking";
import { buildQuerySignature } from "../lib/search/query-signature";
import { searchItems } from "../lib/search/search-service";

const PREFIX = "__VERIFY_NS__";

function assertVirtualGuard() {
  assert.equal(isReservedVirtualFeedbackBoqId(VIRTUAL_NO_SUITABLE_CANDIDATE_KEY), true);
  assert.equal(isReservedVirtualFeedbackBoqId("  " + VIRTUAL_NO_SUITABLE_CANDIDATE_KEY), true);
  assert.equal(isReservedVirtualFeedbackBoqId("cuid_real_boq"), false);
  assert.equal(isReservedVirtualFeedbackBoqId(undefined), false);
}

/** Mirrors the first `boqItemId` check in `app/api/search-feedback/route.ts` (POST). */
function assertApiRejectsReservedBoqIdLikeRoute() {
  const boqItemIdRaw = VIRTUAL_NO_SUITABLE_CANDIDATE_KEY;
  assert.equal(
    isReservedVirtualFeedbackBoqId(boqItemIdRaw),
    true,
    "POST /api/search-feedback must reject this value before any DB write"
  );
}

async function assertNoBoqRowWithVirtualId() {
  const hit = await prisma.boqItem.findUnique({
    where: { id: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY },
    select: { id: true },
  });
  assert.equal(hit, null, "virtual id must not exist as BoqItem");
}

async function assertSearchResultsNeverUseVirtualItemId() {
  const { results } = await searchItems(`${PREFIX}smoke_${Date.now()}`, undefined, {
    maxResults: 50,
  });
  for (const r of results) {
    assert.notEqual(
      r.itemId,
      VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
      "search must never return the reserved virtual key as itemId"
    );
  }
}

async function cleanupVerifyRows() {
  await prisma.searchFeedback.deleteMany({
    where: { query: { startsWith: PREFIX } },
  });
}

async function assertNoSuitableRowShape() {
  const q = `${PREFIX}shape_${Date.now()}`;
  const nq = normalizeFeedbackLookupKey(q);
  const row = await prisma.searchFeedback.create({
    data: {
      query: q,
      normalizedQuery: nq,
      querySignature: "sigtest",
      boqItemId: null,
      action: "no_suitable_result",
      weight: -1,
      virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
    },
  });
  const again = await prisma.searchFeedback.findUnique({
    where: { id: row.id },
    select: {
      boqItemId: true,
      virtualCandidateKey: true,
      action: true,
    },
  });
  assert.equal(again?.boqItemId, null);
  assert.equal(again?.virtualCandidateKey, VIRTUAL_NO_SUITABLE_CANDIDATE_KEY);
  assert.equal(again?.action, "no_suitable_result");
  await prisma.searchFeedback.delete({ where: { id: row.id } });
}

async function assertQualityWarningAfterThree() {
  const stamp = Date.now();
  const raw = `${PREFIX}warn_${stamp}`;
  const nq = normalizeFeedbackLookupKey(raw);
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await prisma.searchFeedback.create({
      data: {
        query: `${raw}_${i}`,
        normalizedQuery: nq,
        querySignature: `sig_warn_${stamp}`,
        boqItemId: null,
        action: "no_suitable_result",
        weight: -1,
        virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
      },
    });
    ids.push(r.id);
  }
  const meta = await buildSearchFeedbackMeta(
    nq,
    `sig_warn_${stamp}`,
    null
  );
  assert.equal(meta.searchQualityWarning, true);
  assert.ok(meta.searchQualityReason);
  assert.ok(meta.noSuitableResultCount >= 3);
  await prisma.searchFeedback.deleteMany({ where: { id: { in: ids } } });
}

async function assertSignatureChannel() {
  const stamp = Date.now();
  const sig = `gach|600x100|sig_${stamp}`;
  const nqA = normalizeFeedbackLookupKey(`${PREFIX}sigA_${stamp}`);
  const nqB = normalizeFeedbackLookupKey(`${PREFIX}sigB_${stamp}`);
  const a = await prisma.searchFeedback.create({
    data: {
      query: `${PREFIX}sigA_${stamp}`,
      normalizedQuery: nqA,
      querySignature: sig,
      boqItemId: null,
      action: "no_suitable_result",
      weight: -1,
      virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
    },
  });
  const b = await prisma.searchFeedback.create({
    data: {
      query: `${PREFIX}sigB_${stamp}`,
      normalizedQuery: nqB,
      querySignature: sig,
      boqItemId: null,
      action: "no_suitable_result",
      weight: -1,
      virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
    },
  });
  const s = await getNoSuitableSignal(nqA, sig, null);
  assert.equal(s.exactNoSuitableCount, 1);
  assert.equal(s.signatureNoSuitableCount, 1);
  const meta = await buildSearchFeedbackMeta(nqA, sig, null);
  assert.equal(meta.noSuitableResultCount, 1);
  assert.equal(meta.noSuitableResultSignatureCount, 1);
  await prisma.searchFeedback.deleteMany({ where: { id: { in: [a.id, b.id] } } });
}

async function assertBoostIgnoresNoSuitableOnly() {
  const stamp = Date.now();
  const raw = `${PREFIX}boost_${stamp}`;
  const nq = normalizeFeedbackLookupKey(raw);
  const sig = `only_ns_${stamp}`;
  await prisma.searchFeedback.create({
    data: {
      query: raw,
      normalizedQuery: nq,
      querySignature: sig,
      boqItemId: null,
      action: "no_suitable_result",
      weight: -1,
      virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
    },
  });
  const map = await getFeedbackBoostDetailMap(nq, sig, null);
  assert.equal(
    map.has(VIRTUAL_NO_SUITABLE_CANDIDATE_KEY),
    false,
    "boost map must never use virtual candidate id"
  );
  for (const k of map.keys()) {
    assert.equal(
      isReservedVirtualFeedbackBoqId(k),
      false,
      "boost keys must be real boq ids"
    );
  }
  await prisma.searchFeedback.deleteMany({ where: { normalizedQuery: nq } });
}

function assertMainSearchRowDisplayPriorities() {
  const item1 = {
    itemId: "id-1",
    importBatchId: "b",
    sourceFileName: "f",
    sheetName: "s",
    sourceRowNumber: 1,
    score: 10,
    confidenceLabel: "Strong Match" as const,
    noiDungTongHop: "one",
    tongCong: "100",
    donVi: "m",
  };
  const item2 = {
    ...item1,
    itemId: "id-2",
    sourceRowNumber: 2,
    score: 5,
    noiDungTongHop: "two",
    tongCong: "200",
  };
  const base = {
    query: "q1",
    results: [item1, item2],
    formPricePeriodCode: "",
  };

  const ns = getMainSearchRowDisplay(
    { ...base, latestSearchSelection: { type: "no_suitable_result" } },
    { q1: item1.itemId }
  );
  assert.equal(ns.mode, "no_suitable_result");
  assert.equal(ns.item, undefined);

  const latestBoq = getMainSearchRowDisplay(
    {
      ...base,
      latestSearchSelection: { type: "selected_item", boqItemId: item2.itemId },
    },
    { q1: item1.itemId }
  );
  assert.equal(latestBoq.mode, "selected_item");
  assert.equal(latestBoq.item?.itemId, item2.itemId);

  const selectedOnly = getMainSearchRowDisplay(
    { ...base, latestSearchSelection: null },
    { q1: item2.itemId }
  );
  assert.equal(selectedOnly.mode, "selected");
  assert.equal(selectedOnly.item?.itemId, item2.itemId);

  const fallback = getMainSearchRowDisplay(
    { ...base, latestSearchSelection: undefined },
    {}
  );
  assert.equal(fallback.mode, "default");
  assert.equal(fallback.item?.itemId, item1.itemId);

  const metaOverride = getMainSearchRowDisplay(
    {
      ...base,
      latestSearchSelection: { type: "selected_item", boqItemId: item2.itemId },
      noSuitableResultSelected: true,
    },
    { q1: item1.itemId }
  );
  assert.equal(metaOverride.mode, "no_suitable_result");
  assert.equal(metaOverride.item, undefined);
}

async function assertLatestSelectionForMainSearchDisplay() {
  const anyItem = await prisma.boqItem.findFirst({ select: { id: true } });
  if (!anyItem) {
    console.warn(
      "[feedback-no-suitable-verify] skip latest-selection display checks (no BoqItem)"
    );
    return;
  }
  const stamp = Date.now();
  const raw = `${PREFIX}latest_${stamp}`;
  const nq = normalizeFeedbackLookupKey(raw);
  const sig = buildQuerySignature(raw) || `sig_latest_${stamp}`;

  await prisma.searchFeedback.create({
    data: {
      query: raw,
      normalizedQuery: nq,
      querySignature: sig,
      boqItemId: anyItem.id,
      action: "select",
      weight: 1,
    },
  });
  let latest = await getLatestSearchSelectionForRawQuery(raw, null);
  assert.equal(latest?.type, "selected_item");
  assert.equal(
    latest?.type === "selected_item" ? latest.boqItemId : null,
    anyItem.id
  );

  await prisma.searchFeedback.create({
    data: {
      query: raw,
      normalizedQuery: nq,
      querySignature: sig,
      boqItemId: null,
      action: "no_suitable_result",
      weight: -1,
      virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
    },
  });
  latest = await getLatestSearchSelectionForRawQuery(raw, null);
  assert.equal(latest?.type, "no_suitable_result");

  const fakeRun = {
    results: [
      {
        itemId: anyItem.id,
        importBatchId: "x",
        sourceFileName: "x",
        sheetName: "s",
        sourceRowNumber: 1,
        score: 1,
        confidenceLabel: "Strong Match" as const,
        noiDungTongHop: "x",
      },
    ],
  };
  const dispAfterNs = getMainSearchRowDisplay(
    {
      query: raw,
      results: fakeRun.results,
      latestSearchSelection: { type: "no_suitable_result" },
      formPricePeriodCode: "",
    },
    { [raw.trim()]: anyItem.id }
  );
  assert.equal(dispAfterNs.mode, "no_suitable_result");
  assert.equal(dispAfterNs.item, undefined);

  await prisma.searchFeedback.create({
    data: {
      query: raw,
      normalizedQuery: nq,
      querySignature: sig,
      boqItemId: anyItem.id,
      action: "select",
      weight: 1,
    },
  });
  latest = await getLatestSearchSelectionForRawQuery(raw, null);
  assert.equal(latest?.type, "selected_item");
  const dispAfterReSelect = getMainSearchRowDisplay(
    {
      query: raw,
      results: fakeRun.results,
      latestSearchSelection: { type: "selected_item", boqItemId: anyItem.id },
      formPricePeriodCode: "",
    },
    {}
  );
  assert.equal(dispAfterReSelect.mode, "selected_item");
  assert.equal(dispAfterReSelect.item?.itemId, anyItem.id);

  await prisma.searchFeedback.deleteMany({ where: { normalizedQuery: nq } });
}

async function main() {
  assertVirtualGuard();
  assertApiRejectsReservedBoqIdLikeRoute();
  assertMainSearchRowDisplayPriorities();

  if (!process.env.DATABASE_URL) {
    console.warn(
      "[feedback-no-suitable-verify] DATABASE_URL missing — DB checks skipped"
    );
    console.log("feedback-no-suitable-verify: ok (guards only)");
    return;
  }

  await assertNoBoqRowWithVirtualId();
  await assertSearchResultsNeverUseVirtualItemId();
  await cleanupVerifyRows();
  try {
    await assertNoSuitableRowShape();
    await assertQualityWarningAfterThree();
    await assertSignatureChannel();
    await assertBoostIgnoresNoSuitableOnly();
    await assertLatestSelectionForMainSearchDisplay();
  } finally {
    await cleanupVerifyRows();
  }

  console.log("feedback-no-suitable-verify: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
