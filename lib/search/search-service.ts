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
  const periodFilter = Boolean(selectedPricePeriodCode);

  const latestBatch = await prisma.importBatch.findFirst({
    where: { completedAt: { not: null } },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  if (!latestBatch) {
    return [];
  }

  const candidates = await prisma.boqItem.findMany({
    where: {
      importBatchId: latestBatch.id,
      isActive: true,
      isSearchable: true,
      normalizedSearchText: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
      ...(periodFilter
        ? {
            prices: {
              some: { pricePeriodCode: selectedPricePeriodCode },
            },
          }
        : {}),
    },
    include: {
      prices: {
        orderBy: { pricePeriodCode: "asc" },
      },
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

    // No period: first row = lexicographically smallest pricePeriodCode (deterministic).
    const selectedPrice = periodFilter
      ? item.prices.find((p) => p.pricePeriodCode === selectedPricePeriodCode)
      : item.prices[0];

    return {
      itemId: item.id,
      importBatchId: item.importBatchId,
      sourceFileName: item.sourceFileName,
      sheetName: item.sheetName,
      sourceRowNumber: item.sourceRowNumber ?? null,
      score: ranking.score,
      confidenceLabel: ranking.confidenceLabel,
      stt: item.stt,
      ctxd: item.ctxd,
      maHieuHsmt: item.maHieuHsmt,
      maHieuKsg: item.maHieuKsg,
      noiDungCongViec: item.noiDungCongViec,
      nhomCongTac: item.nhomCongTac,
      quyCachKyThuat: item.quyCachKyThuat,
      donVi: item.donVi,
      pricePeriodCode: selectedPrice?.pricePeriodCode ?? null,
      pricePeriodLabel: selectedPrice?.pricePeriodLabel ?? null,
      vatTu: selectedPrice?.vatTu?.toString() ?? null,
      thiCong: selectedPrice?.thiCong?.toString() ?? null,
      tongCong: selectedPrice?.tongCong?.toString() ?? null,
      linkHdThamKhao: selectedPrice?.linkHdThamKhao ?? null,
      ghiChu: selectedPrice?.ghiChu ?? null,
      scoreBreakdown: ranking.breakdown,
    };
  });

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}