import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { calculateScore } from "../ranking/calculate-score";
import type { SearchResult } from "./search-types";
import {
  canonicalizeTechnicalText,
  cmQueryFitsSpecCaps,
  diameterQueryContainedInSpec,
  extractCmCapsFromSpec,
  extractCmValuesFromQuery,
  extractDiameterTokens,
  isTechnicalSearchToken,
} from "./technical-match";

/** Lexical normalization for measurements (keep in sync with calculate-score). */
function normalizeTechnicalForms(s: string): string {
  return s
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\b(\d+)\s+cm\b/gi, "$1cm")
    .replace(/\bD\s*(\d+)\b/gi, "D$1")
    .replace(/\bD(\d+)\s*-\s*D(\d+)\b/gi, "D$1-D$2");
}

function buildNoiDungTongHop(item: {
  noiDungCongViec?: string | null;
  quyCachKyThuat?: string | null;
  nhomCongTac?: string | null;
}): string {
  const parts = [
    item.noiDungCongViec?.trim(),
    item.quyCachKyThuat?.trim(),
    item.nhomCongTac?.trim(),
  ].filter((p): p is string => Boolean(p));
  return parts.join(" · ");
}

function normalizeQuery(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
  return normalizeTechnicalForms(base);
}

/** Smallest <=…cm cap in quy (for ranking the tightest price tier first). */
function smallestQuyCmCap(quy: string | null | undefined): number | null {
  if (!quy) return null;
  const caps = extractCmCapsFromSpec(canonicalizeTechnicalText(normalizeQuery(quy)));
  return caps.length ? Math.min(...caps) : null;
}

export async function searchItems(
  query: string,
  selectedPricePeriodCode?: string
): Promise<SearchResult[]> {
  const normalizedQuery = normalizeQuery(query);
  const periodFilter = Boolean(selectedPricePeriodCode);

  const searchTokens = normalizedQuery
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const lexicalTokens = searchTokens.filter((t) => !isTechnicalSearchToken(t));
  const hasTechnicalTokens = lexicalTokens.length < searchTokens.length;
  const queryCanon = canonicalizeTechnicalText(normalizedQuery);
  const queryHasCm = extractCmValuesFromQuery(queryCanon).length > 0;
  const queryHasDiameter = extractDiameterTokens(queryCanon).length > 0;
  const needsTechnicalPass = hasTechnicalTokens && lexicalTokens.length > 0;

  function itemPassesTechnicalFilter(item: {
    normalizedQuyCachKyThuat: string | null;
    normalizedNoiDungCongViec: string | null;
    normalizedNhomCongTac: string | null;
  }): boolean {
    if (!queryHasCm && !queryHasDiameter) {
      return true;
    }
    const specCanon = canonicalizeTechnicalText(
      [
        item.normalizedQuyCachKyThuat ?? "",
        item.normalizedNoiDungCongViec ?? "",
        item.normalizedNhomCongTac ?? "",
      ].join(" ")
    );
    if (queryHasCm && !cmQueryFitsSpecCaps(queryCanon, specCanon)) {
      return false;
    }
    if (queryHasDiameter && !diameterQueryContainedInSpec(queryCanon, specCanon)) {
      return false;
    }
    return true;
  }

  /** Primary: nhóm + nội dung + quy (full phrase OR conjunctive tokens). */
  const primaryRetrievalPredicate =
    searchTokens.length === 0
      ? {
          normalizedPrimarySearchText: {
            contains: normalizedQuery,
            mode: "insensitive" as const,
          },
        }
      : {
          OR: [
            {
              normalizedPrimarySearchText: {
                contains: normalizedQuery,
                mode: "insensitive" as const,
              },
            },
            {
              AND: searchTokens.map((token) => ({
                normalizedPrimarySearchText: {
                  contains: token,
                  mode: "insensitive" as const,
                },
              })),
            },
          ],
        };

  /**
   * Weaker fallback: full query on aggregated blob, but every token must still hit
   * at least one primary column (nhóm / nội dung / quy) — YCK alone cannot admit a row.
   */
  const fallbackRetrievalPredicate =
    searchTokens.length === 0
      ? {
          AND: [
            {
              normalizedSearchText: {
                contains: normalizedQuery,
                mode: "insensitive" as const,
              },
            },
            { NOT: { normalizedPrimarySearchText: { equals: "" } } },
          ],
        }
      : {
          AND: [
            {
              normalizedSearchText: {
                contains: normalizedQuery,
                mode: "insensitive" as const,
              },
            },
            { NOT: { normalizedPrimarySearchText: { equals: "" } } },
            ...searchTokens.map((token) => ({
              OR: [
                {
                  normalizedNhomCongTac: {
                    contains: token,
                    mode: "insensitive" as const,
                  },
                },
                {
                  normalizedNoiDungCongViec: {
                    contains: token,
                    mode: "insensitive" as const,
                  },
                },
                {
                  normalizedQuyCachKyThuat: {
                    contains: token,
                    mode: "insensitive" as const,
                  },
                },
              ],
            })),
          ],
        };

  /**
   * Broad path: AND lexical tokens only on primary (DB may keep "21 cm" while query token is "21cm").
   * Rows are post-filtered with `itemPassesTechnicalFilter` when the query carries cm / D… constraints.
   */
  const broadPrimaryRetrievalPredicate =
    lexicalTokens.length === 0
      ? null
      : {
          AND: lexicalTokens.map((token) => ({
            normalizedPrimarySearchText: {
              contains: token,
              mode: "insensitive" as const,
            },
          })),
        };

  const retrievalOrBranches = [
    primaryRetrievalPredicate,
    fallbackRetrievalPredicate,
    ...(needsTechnicalPass && broadPrimaryRetrievalPredicate
      ? [broadPrimaryRetrievalPredicate]
      : []),
  ];

  const retrievalPredicate: Prisma.BoqItemWhereInput = {
    OR: retrievalOrBranches as Prisma.BoqItemWhereInput[],
  };

  const latestBatch = await prisma.importBatch.findFirst({
    where: { completedAt: { not: null } },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  if (!latestBatch) {
    return [];
  }

  type BoqSearchRow = Prisma.BoqItemGetPayload<{
    include: { prices: true };
  }>;

  const candidates = await prisma.boqItem.findMany({
    where: {
      importBatchId: latestBatch.id,
      isActive: true,
      isSearchable: true,
      ...retrievalPredicate,
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
    take: needsTechnicalPass ? 250 : 20,
  });

  let filteredCandidates: BoqSearchRow[] = needsTechnicalPass
    ? candidates.filter((item) => itemPassesTechnicalFilter(item))
    : candidates;

  /**
   * Diameter rescue: primary AND may miss rows where D… lives only in the full blob
   * (e.g. "D10x220" in quy). ILIKE `d10` still false-positives `d1000`; post-filter fixes that.
   */
  const dToks = extractDiameterTokens(queryCanon);
  if (
    filteredCandidates.length === 0 &&
    queryHasDiameter &&
    lexicalTokens.length > 0 &&
    dToks.length > 0
  ) {
    const extra = await prisma.boqItem.findMany({
      where: {
        importBatchId: latestBatch.id,
        isActive: true,
        isSearchable: true,
        OR: dToks.map((t) => ({
          normalizedSearchText: {
            contains: t,
            mode: "insensitive" as const,
          },
        })),
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
      take: 400,
    });
    const blobHasLexical = (it: (typeof extra)[number]) => {
      const blob = (it.normalizedSearchText ?? "").toLowerCase();
      return lexicalTokens.some((tok) => blob.includes(tok.toLowerCase()));
    };
    filteredCandidates = extra
      .filter((item) => itemPassesTechnicalFilter(item))
      .filter(blobHasLexical) as BoqSearchRow[];
  }

  /**
   * When the query specifies a measured cm diameter, keep only BOQ tiers whose
   * upper bound is the smallest cap that still fits (e.g. 21 cm → <=30cm, not <=40cm).
   */
  if (queryHasCm) {
    const qDiam = extractCmValuesFromQuery(queryCanon);
    if (qDiam.length > 0) {
      const v = Math.max(...qDiam);
      const withCap = filteredCandidates
        .map((item) => ({
          item,
          cap: smallestQuyCmCap(item.normalizedQuyCachKyThuat ?? undefined),
        }))
        .filter(
          (row): row is { item: BoqSearchRow; cap: number } =>
            row.cap != null && v <= row.cap
        );
      if (withCap.length > 0) {
        const tightestCap = Math.min(...withCap.map((r) => r.cap));
        filteredCandidates = withCap
          .filter((r) => r.cap === tightestCap)
          .map((r) => r.item);
      }
    }
  }

  const results: SearchResult[] = filteredCandidates.map((item) => {
    const ranking = calculateScore(normalizedQuery, {
      normalizedSearchText: item.normalizedSearchText,
      normalizedNoiDungCongViec: item.normalizedNoiDungCongViec,
      normalizedNhomCongTac: item.normalizedNhomCongTac,
      normalizedQuyCachKyThuat: item.normalizedQuyCachKyThuat,
      normalizedYeuCauKhac: item.normalizedYeuCauKhac,
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
      noiDungTongHop: buildNoiDungTongHop(item),
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

  return results
    .sort((a, b) => {
      if (queryHasCm) {
        const ca = smallestQuyCmCap(a.quyCachKyThuat);
        const cb = smallestQuyCmCap(b.quyCachKyThuat);
        if (ca != null && cb != null && ca !== cb) return ca - cb;
        if (ca != null && cb == null) return -1;
        if (ca == null && cb != null) return 1;
      }
      return b.score - a.score;
    })
    .slice(0, 5);
}