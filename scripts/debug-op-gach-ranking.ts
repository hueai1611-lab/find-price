/**
 * One-off: compare ranking for the porcelain / ốp chân tường query vs gia công row.
 * Run: npx tsx scripts/debug-op-gach-ranking.ts
 */
import "dotenv/config";

import { calculateScore } from "../lib/ranking/calculate-score";
import { prisma } from "../lib/db/prisma";
import { collectQuerySearchTokens } from "../lib/search/boq-search-expand";
import { normalizeBaseSearchString } from "../lib/search/boq-search-normalize";
import {
  canonicalizeTechnicalText,
  extractCmValuesFromQuery,
  extractDiameterTokens,
  isTechnicalSearchToken,
} from "../lib/search/technical-match";

const QUERY =
  "Công tác ốp gạch vào chân tường, viền tường, viền trụ, cột bằng Gạch Porcelain KT 600x100";
const PERIOD = "Q2_2026";

async function main() {
  const normalizedQuery = normalizeBaseSearchString(QUERY);
  const searchTokens = collectQuerySearchTokens(normalizedQuery);
  const lexicalTokens = searchTokens.filter((t) => !isTechnicalSearchToken(t));
  const queryCanon = canonicalizeTechnicalText(normalizedQuery);
  const hasTechnicalTokens = lexicalTokens.length < searchTokens.length;
  const needsTechnicalPass = hasTechnicalTokens && lexicalTokens.length > 0;

  console.log({
    normalizedQuery,
    searchTokensCount: searchTokens.length,
    searchTokens: searchTokens.slice(0, 40),
    needsTechnicalPass,
    queryCanon,
    diameterToks: extractDiameterTokens(queryCanon),
    cmVals: extractCmValuesFromQuery(queryCanon),
  });

  const latestBatch = await prisma.importBatch.findFirst({
    where: { completedAt: { not: null }, pricePeriodCode: PERIOD },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (!latestBatch) {
    console.error("No batch for period", PERIOD);
    process.exit(1);
  }

  const needleMain = "op chan tuong";
  const needleAux = "gia cong";

  const scan = async (take: number, label: string) => {
    const rows = await prisma.boqItem.findMany({
      where: {
        importBatchId: latestBatch.id,
        isActive: true,
        isSearchable: true,
        OR: [
          { normalizedPrimarySearchText: { contains: "op", mode: "insensitive" } },
          { normalizedNoiDungCongViec: { contains: "op", mode: "insensitive" } },
        ],
        prices: { some: { pricePeriodCode: PERIOD } },
      },
      take,
      orderBy: { id: "asc" },
      select: {
        id: true,
        sourceRowNumber: true,
        donVi: true,
        noiDungCongViec: true,
        nhomCongTac: true,
        quyCachKyThuat: true,
        normalizedNoiDungCongViec: true,
        normalizedNhomCongTac: true,
        normalizedQuyCachKyThuat: true,
        normalizedYeuCauKhac: true,
        normalizedSearchText: true,
        normalizedExpansionSearchText: true,
      },
    });

    const scored = rows.map((item) => {
      const r = calculateScore(normalizedQuery, {
        normalizedSearchText: item.normalizedSearchText ?? "",
        normalizedNoiDungCongViec: item.normalizedNoiDungCongViec,
        normalizedNhomCongTac: item.normalizedNhomCongTac,
        normalizedQuyCachKyThuat: item.normalizedQuyCachKyThuat,
        normalizedYeuCauKhac: item.normalizedYeuCauKhac,
        normalizedExpansionSearchText: item.normalizedExpansionSearchText,
        donVi: item.donVi,
      });
      return { item, ...r };
    });
    scored.sort((a, b) => b.score - a.score);

    const findMain = scored.find((s) =>
      (s.item.noiDungCongViec ?? "").toLowerCase().includes(needleMain),
    );
    const findAux = scored.find((s) =>
      (s.item.noiDungCongViec ?? "").toLowerCase().includes(needleAux),
    );

    console.log("\n===", label, "candidates=", rows.length, "===");
    console.log(
      "top5",
      scored.slice(0, 5).map((s) => ({
        id: s.item.id,
        row: s.item.sourceRowNumber,
        score: s.score,
        donVi: s.item.donVi,
        nd: (s.item.noiDungCongViec ?? "").slice(0, 70),
      })),
    );
    console.log(
      "mainRow",
      findMain
        ? {
            id: findMain.item.id,
            row: findMain.item.sourceRowNumber,
            score: findMain.score,
            breakdown: findMain.breakdown,
          }
        : "NOT IN SET",
    );
    console.log(
      "auxRow",
      findAux
        ? {
            id: findAux.item.id,
            row: findAux.item.sourceRowNumber,
            score: findAux.score,
            breakdown: findAux.breakdown,
          }
        : "NOT IN SET",
    );
  };

  await scan(80, "wide op-filter take=80");
  await scan(5000, "wide op-filter take=5000");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
