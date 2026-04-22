import { NextResponse } from "next/server";
import { searchItems } from "@/lib/search/search-service";

const VALIDATION_ERROR = "query is required and must be a non-empty string";
const BATCH_VALIDATION_ERROR =
  "queries must be a non-empty array of non-empty strings (max 30)";
const MAX_QUERIES = 30;

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

  const results = await searchItems(query, pricePeriodCode);

  return NextResponse.json({ results });
}

type PostBody = {
  queries?: unknown;
  pricePeriodCode?: unknown;
};

/**
 * Multiple BOQ lines in one request: runs the same `searchItems` logic per line.
 * Response: `{ byQuery: { query, results }[] }` (order preserved).
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
    return NextResponse.json({ error: BATCH_VALIDATION_ERROR }, { status: 400 });
  }

  const queries = rawList
    .map((q) => (typeof q === "string" ? q.trim() : ""))
    .filter((q) => q.length > 0);

  if (queries.length === 0 || queries.length > MAX_QUERIES) {
    return NextResponse.json({ error: BATCH_VALIDATION_ERROR }, { status: 400 });
  }

  const pricePeriodCode =
    typeof body.pricePeriodCode === "string" && body.pricePeriodCode.trim() !== ""
      ? body.pricePeriodCode.trim()
      : undefined;

  const byQuery = await Promise.all(
    queries.map(async (query) => ({
      query,
      results: await searchItems(query, pricePeriodCode),
    }))
  );

  return NextResponse.json({ byQuery });
}
