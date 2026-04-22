import { prisma } from "../db/prisma";
import { calculateScore } from "../ranking/calculate-score";
import type { SearchResult } from "./search-types";

function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchItems(
  query: string,
  selectedPricePeriodCode?: string
): Promise<SearchResult[]> {
  const normalizedQuery = normalizeQuery(query);

  const candidates = await prisma.boqItem.findMany({
    where: {
      isActive: true,
      isSearchable: true,
      normalizedSearchText: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
    include: {
      prices: true,
    },
    take: 20,
  });

  const results: SearchResult[] = candidates.map((item) => {
    const ranking = calculateScore(normalizedQuery, {
      normalizedSearchText: item.normalizedSearchText,
      normalizedNoiDungCongViec: item.normalizedNoiDungCongViec,
      normalizedNhomCongTac: item.normalizedNhomCongTac,
      normalizedQuyCachKyThuat: item.normalizedQuyCachKyThuat,
    });

    const selectedPrice =
      item.prices.find((p) => p.pricePeriodCode === selectedPricePeriodCode) ??
      item.prices[0];

    return {
      itemId: item.id,
      score: ranking.score,
      confidenceLabel: ranking.confidenceLabel,
      noiDungCongViec: item.noiDungCongViec,
      nhomCongTac: item.nhomCongTac,
      quyCachKyThuat: item.quyCachKyThuat,
      donVi: item.donVi,
      pricePeriodCode: selectedPrice?.pricePeriodCode ?? null,
      pricePeriodLabel: selectedPrice?.pricePeriodLabel ?? null,
      tongCong: selectedPrice?.tongCong?.toString() ?? null,
      scoreBreakdown: ranking.breakdown,
    };
  });

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}