import { NextResponse } from "next/server";
import { searchItems } from "@/lib/search/search-service";

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

  const results = await searchItems(query, pricePeriodCode);

  return NextResponse.json({ results });
}
