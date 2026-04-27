import { NextResponse } from "next/server";
import {
  BATCH_SEARCH_QUERIES_VALIDATION_MESSAGE,
  MAX_BATCH_SEARCH_QUERIES,
} from "@/lib/search/batch-search-query-limit";
import { searchItemsWithLatestSelectionRestore } from "@/lib/search/search-service";

const VALIDATION_ERROR = "query is required and must be a non-empty string";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("query");
  const rawPeriod = searchParams.get("pricePeriodCode");

  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  if (!query) {
    return NextResponse.json({ error: VALIDATION_ERROR }, { status: 400 });
  }

  const pricePeriodCode =
    typeof rawPeriod === "string" && rawPeriod.trim() !== ""
      ? rawPeriod.trim()
      : undefined;

  const {
    results,
    totalMatched,
    searchFeedbackMeta,
    latestSearchSelection,
    noSuitableResultSelected,
  } = await searchItemsWithLatestSelectionRestore(query, pricePeriodCode);

  return NextResponse.json({
    results,
    totalMatched,
    ...(searchFeedbackMeta != null ? { searchFeedbackMeta } : {}),
    ...(latestSearchSelection !== undefined
      ? { latestSearchSelection }
      : {}),
    ...(noSuitableResultSelected ? { noSuitableResultSelected: true } : {}),
  });
}

type PostBody = {
  queries?: unknown;
  pricePeriodCode?: unknown;
};

/**
 * Multiple BOQ lines in one request: runs the same `searchItems` logic per line.
 * Response: `{ byQuery: { query, results, totalMatched }[] }` (order preserved).
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

  const byQuery = await Promise.all(
    queries.map(async (query) => {
      const {
        results,
        totalMatched,
        searchFeedbackMeta,
        latestSearchSelection,
        noSuitableResultSelected,
      } = await searchItemsWithLatestSelectionRestore(query, pricePeriodCode);
      return {
        query,
        results,
        totalMatched,
        ...(searchFeedbackMeta != null ? { searchFeedbackMeta } : {}),
        ...(latestSearchSelection !== undefined
          ? { latestSearchSelection }
          : {}),
        ...(noSuitableResultSelected ? { noSuitableResultSelected: true } : {}),
      };
    })
  );

  return NextResponse.json({ byQuery });
}
