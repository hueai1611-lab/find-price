import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { normalizeFeedbackLookupKey } from "@/lib/search/feedback-lookup-key";
import {
  feedbackWeightForAction,
  isSearchFeedbackAction,
} from "@/lib/search/feedback-ranking";
import {
  isReservedVirtualFeedbackBoqId,
  VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
} from "@/lib/search/feedback-no-suitable-signal";
import { buildQuerySignature } from "@/lib/search/query-signature";

type Body = {
  query?: unknown;
  boqItemId?: unknown;
  pricePeriodCode?: unknown;
  action?: unknown;
  resultBoqItemIds?: unknown;
  resultCount?: unknown;
  selectedRank?: unknown;
};

function parseResultBoqItemIds(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === "string" && x.trim() !== "") out.push(x.trim());
  }
  return out.length ? out : undefined;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const rawQuery = typeof body.query === "string" ? body.query.trim() : "";
  const boqItemIdRaw = typeof body.boqItemId === "string" ? body.boqItemId.trim() : "";
  const pricePeriodCode =
    typeof body.pricePeriodCode === "string" && body.pricePeriodCode.trim() !== ""
      ? body.pricePeriodCode.trim()
      : null;

  if (!rawQuery) {
    return NextResponse.json({ error: "query is required and must be non-empty" }, { status: 400 });
  }

  if (isReservedVirtualFeedbackBoqId(boqItemIdRaw)) {
    return NextResponse.json(
      { error: "reserved virtual candidate key cannot be used as boqItemId" },
      { status: 400 }
    );
  }

  const actionRaw =
    typeof body.action === "string" && body.action.trim() !== ""
      ? body.action.trim()
      : "select";
  const action = actionRaw;

  if (!isSearchFeedbackAction(action)) {
    return NextResponse.json(
      {
        error:
          "action must be one of: view, click, select, add_to_project, export, no_suitable_result",
      },
      { status: 400 }
    );
  }

  if (action !== "no_suitable_result" && !boqItemIdRaw) {
    return NextResponse.json(
      { error: "boqItemId is required unless action is no_suitable_result" },
      { status: 400 }
    );
  }

  if (boqItemIdRaw && action !== "no_suitable_result") {
    const exists = await prisma.boqItem.findUnique({
      where: { id: boqItemIdRaw },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "boq item not found" }, { status: 404 });
    }
  }

  const normalizedQuery = normalizeFeedbackLookupKey(rawQuery);
  if (!normalizedQuery) {
    return NextResponse.json({ error: "query normalizes to empty" }, { status: 400 });
  }

  const querySignature = buildQuerySignature(rawQuery) || null;
  const weight = feedbackWeightForAction(action);

  const resultBoqItemIds = parseResultBoqItemIds(body.resultBoqItemIds);
  const resultCount =
    typeof body.resultCount === "number" && Number.isFinite(body.resultCount)
      ? Math.trunc(body.resultCount)
      : undefined;
  const selectedRank =
    typeof body.selectedRank === "number" && Number.isFinite(body.selectedRank)
      ? Math.trunc(body.selectedRank)
      : undefined;

  const virtualCandidateKey =
    action === "no_suitable_result" ? VIRTUAL_NO_SUITABLE_CANDIDATE_KEY : null;

  await prisma.searchFeedback.create({
    data: {
      query: rawQuery,
      normalizedQuery,
      querySignature,
      boqItemId:
        action === "no_suitable_result" ? null : boqItemIdRaw || null,
      pricePeriodCode,
      action,
      weight,
      ...(virtualCandidateKey != null ? { virtualCandidateKey } : {}),
      ...(resultBoqItemIds != null ? { resultBoqItemIds: resultBoqItemIds } : {}),
      ...(resultCount != null ? { resultCount } : {}),
      ...(selectedRank != null ? { selectedRank } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
