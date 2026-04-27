import { NextResponse } from "next/server";

import {
  BATCH_SEARCH_QUERIES_VALIDATION_MESSAGE,
  MAX_BATCH_SEARCH_QUERIES,
} from "@/lib/search/batch-search-query-limit";
import {
  getLatestSearchSelectionsForRawQueries,
  latestSelectionToDto,
} from "@/lib/search/feedback-latest-selection";

type PostBody = {
  queries?: unknown;
  pricePeriodCode?: unknown;
};

/**
 * Batch latest explicit selection (`select` / `no_suitable_result`) per raw query line.
 * Used by main `/search` when restoring from draft or returning from `/search/all`.
 */
export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const rawList = body.queries;
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return NextResponse.json(
      { error: BATCH_SEARCH_QUERIES_VALIDATION_MESSAGE },
      { status: 400 },
    );
  }

  const queries = rawList
    .map((q) => (typeof q === "string" ? q.trim() : ""))
    .filter((q) => q.length > 0);

  if (queries.length === 0 || queries.length > MAX_BATCH_SEARCH_QUERIES) {
    return NextResponse.json(
      { error: BATCH_SEARCH_QUERIES_VALIDATION_MESSAGE },
      { status: 400 },
    );
  }

  const pricePeriodCode =
    typeof body.pricePeriodCode === "string" && body.pricePeriodCode.trim() !== ""
      ? body.pricePeriodCode.trim()
      : undefined;

  const map = await getLatestSearchSelectionsForRawQueries(
    queries,
    pricePeriodCode
  );

  const byQuery = queries.map((query) => ({
    query,
    latestSearchSelection: latestSelectionToDto(map.get(query) ?? null),
  }));

  return NextResponse.json({ byQuery });
}
