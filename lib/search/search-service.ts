import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { calculateScore } from "../ranking/calculate-score";
import type { SearchResult } from "./search-types";
import { getSearchRetrievalSettings } from "./search-retrieval-settings";
import { buildReducedSearchQueries } from "./query-fallback";
import { applyBoqDiameterCanonicalForms } from "./boq-diameter-normalize";
import {
  collectQuerySearchTokens,
  collectRetrievalConjunctiveQueryTokens,
  retrievalSynonymInjectBundles,
} from "./boq-search-expand";
import { buildObjectRetrievalOrBranches } from "./boq-object-semantic";
import { normalizeBaseSearchString } from "./boq-search-normalize";
import { normalizeFeedbackLookupKey } from "./feedback-lookup-key";
import {
  applyFeedbackBoostAndResort,
  getFeedbackBoostDetailMap,
} from "./feedback-ranking";
import { buildQuerySignature } from "./query-signature";
import {
  getLatestSearchSelection,
  getLatestSearchSelectionForRawQuery,
  latestSelectionToDto,
} from "./feedback-latest-selection";
import type { SearchLatestSelectionDTO } from "./feedback-latest-selection";
import {
  buildSearchFeedbackMeta,
  type SearchFeedbackMeta,
} from "./feedback-no-suitable-signal";

export type { SearchFeedbackMeta } from "./feedback-no-suitable-signal";
export type { SearchLatestSelectionDTO } from "./feedback-latest-selection";
import {
  canonicalizeTechnicalText,
  cmQueryFitsSpecCaps,
  diameterQueryContainedInSpec,
  extractCmCapsFromSpec,
  extractCmValuesFromQuery,
  extractDiameterTokens,
  isTechnicalSearchToken,
} from "./technical-match";

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
  return normalizeBaseSearchString(input);
}

/** Smallest <=…cm cap in quy (for ranking the tightest price tier first). */
function smallestQuyCmCap(quy: string | null | undefined): number | null {
  if (!quy) return null;
  const caps = extractCmCapsFromSpec(
    canonicalizeTechnicalText(normalizeBaseSearchString(quy))
  );
  return caps.length ? Math.min(...caps) : null;
}

export type SearchItemsOptions = {
  /**
   * Max rows returned after ranking. Default 5.
   * Use `Infinity` for no cap (e.g. full list UI); retrieval `take` limits still apply.
   */
  maxResults?: number;
  /**
   * When true, do not run reduced-keyword fallback (avoids recursion; internal use).
   */
  skipReducedQueryFallback?: boolean;
  /**
   * Raw user query used for ranking and technical post-filters when `query` is only a
   * reduced retrieval substring (see reduced-query fallback in `searchItems`).
   */
  scoringQueryOverride?: string;
  /**
   * When true, keep lexical hits even if `searchFeedbackMeta` reports collective no-suitable
   * feedback (e.g. `/search/all` must still list candidates).
   */
  skipNoSuitableMetaEmptyOverride?: boolean;
};

export type SearchItemsPayload = {
  results: SearchResult[];
  /** Count after ranking / sort, before `maxResults` slice (matches “Xem thêm” row count). */
  totalMatched: number;
  /** No-suitable virtual candidate signal + quality flags (never a BOQ row). */
  searchFeedbackMeta?: SearchFeedbackMeta;
  /** Latest explicit `select` / `no_suitable_result` for main `/search` display only. */
  latestSearchSelection?: SearchLatestSelectionDTO | null;
  /**
   * When true, collective no-suitable feedback for this query + period emptied `results`
   * at composition time (main `/search` treats the line as no valid hit).
   */
  noSuitableResultSelected?: boolean;
};

async function loadSearchFeedbackMetaSafe(
  scoringQueryRaw: string,
  selectedPricePeriodCode?: string
): Promise<SearchFeedbackMeta | undefined> {
  try {
    const key = normalizeFeedbackLookupKey(scoringQueryRaw);
    const sig = buildQuerySignature(scoringQueryRaw);
    return await buildSearchFeedbackMeta(
      key,
      sig,
      selectedPricePeriodCode ?? null
    );
  } catch {
    return undefined;
  }
}

function shouldEmptyResultsForNoSuitableMeta(
  meta: SearchFeedbackMeta | undefined,
  skipOverride?: boolean
): boolean {
  if (skipOverride || meta == null) return false;
  return (
    meta.noSuitableResultCount > 0 ||
    (meta.totalNoSuitableWeight ?? 0) > 0
  );
}

async function loadLatestSearchSelectionSafe(
  scoringQueryRaw: string,
  selectedPricePeriodCode?: string
): Promise<SearchLatestSelectionDTO | null | undefined> {
  try {
    const row = await getLatestSearchSelectionForRawQuery(
      scoringQueryRaw,
      selectedPricePeriodCode ?? null
    );
    return latestSelectionToDto(row);
  } catch {
    return undefined;
  }
}

export async function searchItems(
  query: string,
  selectedPricePeriodCode?: string,
  options?: SearchItemsOptions
): Promise<SearchItemsPayload> {
  const scoringQueryRaw = (options?.scoringQueryOverride ?? query).trim();
  const normalizedRetrievalQuery = normalizeQuery(query);
  const normalizedScoringQuery = normalizeQuery(scoringQueryRaw);
  if (process.env.DEBUG_BOQ_SEARCH === "1") {
    // eslint-disable-next-line no-console
    console.error("[searchItems] entry", {
      rawQueryLen: query.length,
      rawQueryHead: query.slice(0, 80),
      normalizedRetrievalLen: normalizedRetrievalQuery.length,
      normalizedRetrievalHead: normalizedRetrievalQuery.slice(0, 120),
      normalizedScoringLen: normalizedScoringQuery.length,
      normalizedScoringHead: normalizedScoringQuery.slice(0, 120),
    });
  }
  const periodFilter = Boolean(selectedPricePeriodCode);

  const searchTokens = collectQuerySearchTokens(normalizedRetrievalQuery);
  const scoringSearchTokens = collectQuerySearchTokens(normalizedScoringQuery);

  const lexicalTokens = searchTokens.filter((t) => !isTechnicalSearchToken(t));
  const scoringLexicalTokens = scoringSearchTokens.filter((t) => !isTechnicalSearchToken(t));
  const hasTechnicalTokens = lexicalTokens.length < searchTokens.length;
  const queryCanon = canonicalizeTechnicalText(normalizedScoringQuery);
  const queryHasCm = extractCmValuesFromQuery(queryCanon).length > 0;
  const queryHasDiameter = extractDiameterTokens(queryCanon).length > 0;
  const needsTechnicalPass = hasTechnicalTokens && lexicalTokens.length > 0;
  const retrievalLimits = getSearchRetrievalSettings();

  function itemPassesTechnicalFilter(item: {
    normalizedQuyCachKyThuat: string | null;
    normalizedNoiDungCongViec: string | null;
    normalizedNhomCongTac: string | null;
  }): boolean {
    if (!queryHasCm && !queryHasDiameter) {
      return true;
    }
    const specCanon = canonicalizeTechnicalText(
      applyBoqDiameterCanonicalForms(
        [
          item.normalizedQuyCachKyThuat ?? "",
          item.normalizedNoiDungCongViec ?? "",
          item.normalizedNhomCongTac ?? "",
        ].join(" ")
      )
    );
    if (queryHasCm && !cmQueryFitsSpecCaps(queryCanon, specCanon)) {
      return false;
    }
    if (queryHasDiameter && !diameterQueryContainedInSpec(queryCanon, specCanon)) {
      return false;
    }
    return true;
  }

  const expansionContains = (value: string): Prisma.BoqItemWhereInput =>
    ({
      ["normalizedExpansionSearchText"]: {
        contains: value,
        mode: "insensitive" as const,
      },
    }) as Prisma.BoqItemWhereInput;

  const primaryOrExpansionPhrase: Prisma.BoqItemWhereInput = {
    OR: [
      {
        normalizedPrimarySearchText: {
          contains: normalizedRetrievalQuery,
          mode: "insensitive" as const,
        },
      },
      expansionContains(normalizedRetrievalQuery),
    ],
  };

  const primaryOrExpansionToken = (token: string): Prisma.BoqItemWhereInput => ({
    OR: [
      {
        normalizedPrimarySearchText: { contains: token, mode: "insensitive" as const },
      },
      expansionContains(token),
    ],
  });

  const retrievalConjunctTokens = collectRetrievalConjunctiveQueryTokens(normalizedRetrievalQuery);
  const retrievalSynonymBundles = retrievalSynonymInjectBundles(normalizedRetrievalQuery);

  const primaryConjunctiveAnd: Prisma.BoqItemWhereInput | null = (() => {
    const parts: Prisma.BoqItemWhereInput[] = [];
    for (const bundle of retrievalSynonymBundles) {
      parts.push({ OR: bundle.map((inj) => primaryOrExpansionToken(inj)) });
    }
    for (const t of retrievalConjunctTokens) {
      parts.push(primaryOrExpansionToken(t));
    }
    if (parts.length === 0) return null;
    return { AND: parts };
  })();

  const fallbackPrimaryTokenSlot = (token: string): Prisma.BoqItemWhereInput => ({
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
      {
        ...expansionContains(token),
      },
    ],
  });

  const fallbackConjunctiveSlots: Prisma.BoqItemWhereInput[] = (() => {
    const slots: Prisma.BoqItemWhereInput[] = [];
    for (const bundle of retrievalSynonymBundles) {
      slots.push({ OR: bundle.map((inj) => fallbackPrimaryTokenSlot(inj)) });
    }
    for (const t of retrievalConjunctTokens) {
      slots.push(fallbackPrimaryTokenSlot(t));
    }
    return slots;
  })();

  /** Primary: nhóm + nội dung + quy (full phrase OR conjunctive tokens) + expansion alias layer. */
  const primaryRetrievalPredicate: Prisma.BoqItemWhereInput =
    primaryConjunctiveAnd == null
      ? primaryOrExpansionPhrase
      : {
          OR: [primaryOrExpansionPhrase, primaryConjunctiveAnd],
        };

  /**
   * Weaker fallback: full query on aggregated blob, but every token must still hit
   * at least one primary column (nhóm / nội dung / quy) — YCK alone cannot admit a row.
   */
  const fallbackRetrievalPredicate =
    fallbackConjunctiveSlots.length === 0
      ? {
          AND: [
            {
              normalizedSearchText: {
                contains: normalizedRetrievalQuery,
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
                contains: normalizedRetrievalQuery,
                mode: "insensitive" as const,
              },
            },
            { NOT: { normalizedPrimarySearchText: { equals: "" } } },
            ...fallbackConjunctiveSlots,
          ],
        };

  const broadLexicalTokens = retrievalConjunctTokens.filter((t) => !isTechnicalSearchToken(t));

  /**
   * Broad path: AND lexical tokens only on primary (DB may keep "21 cm" while query token is "21cm").
   * Rows are post-filtered with `itemPassesTechnicalFilter` when the query carries cm / D… constraints.
   */
  const broadPrimaryRetrievalPredicate: Prisma.BoqItemWhereInput | null =
    broadLexicalTokens.length === 0
      ? null
      : {
          AND: broadLexicalTokens.map((token) => primaryOrExpansionToken(token)),
        };

  const objectRetrievalExtras = buildObjectRetrievalOrBranches(normalizedRetrievalQuery);

  const retrievalOrBranches = [
    primaryRetrievalPredicate,
    fallbackRetrievalPredicate,
    ...(needsTechnicalPass && broadPrimaryRetrievalPredicate
      ? [broadPrimaryRetrievalPredicate]
      : []),
    ...objectRetrievalExtras,
  ];

  const retrievalPredicate: Prisma.BoqItemWhereInput = {
    OR: retrievalOrBranches as Prisma.BoqItemWhereInput[],
  };

  const latestBatch = await prisma.importBatch.findFirst({
    where: {
      completedAt: { not: null },
      ...(periodFilter && selectedPricePeriodCode
        ? { pricePeriodCode: selectedPricePeriodCode.trim() }
        : {}),
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  if (!latestBatch) {
    const searchFeedbackMeta = await loadSearchFeedbackMetaSafe(
      scoringQueryRaw,
      selectedPricePeriodCode
    );
    const latestSearchSelection = await loadLatestSearchSelectionSafe(
      scoringQueryRaw,
      selectedPricePeriodCode
    );
    const noSuitableSelectedByMeta = shouldEmptyResultsForNoSuitableMeta(
      searchFeedbackMeta,
      options?.skipNoSuitableMetaEmptyOverride
    );
    return {
      results: [],
      totalMatched: 0,
      ...(searchFeedbackMeta != null ? { searchFeedbackMeta } : {}),
      ...(latestSearchSelection !== undefined
        ? { latestSearchSelection }
        : {}),
      ...(noSuitableSelectedByMeta ? { noSuitableResultSelected: true } : {}),
    };
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
    take: needsTechnicalPass
      ? retrievalLimits.takePrimaryTechnical
      : retrievalLimits.takePrimarySimple,
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
    scoringLexicalTokens.length > 0 &&
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
      take: retrievalLimits.takeDiameterRescue,
    });
    const blobHasLexical = (it: (typeof extra)[number]) => {
      const blob = (it.normalizedSearchText ?? "").toLowerCase();
      return scoringLexicalTokens.some((tok) => blob.includes(tok.toLowerCase()));
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

  const scored: SearchResult[] = filteredCandidates.map((item) => {
    if (process.env.DEBUG_BOQ_SEARCH === "1" && filteredCandidates.indexOf(item) === 0) {
      // eslint-disable-next-line no-console
      console.error("[searchItems] first candidate scoring", {
        normalizedScoringLen: normalizedScoringQuery.length,
        normalizedScoringHead: normalizedScoringQuery.slice(0, 120),
      });
    }
    const ranking = calculateScore(
      normalizedScoringQuery,
      {
        normalizedSearchText: item.normalizedSearchText,
        normalizedNoiDungCongViec: item.normalizedNoiDungCongViec,
        normalizedNhomCongTac: item.normalizedNhomCongTac,
        normalizedQuyCachKyThuat: item.normalizedQuyCachKyThuat,
        normalizedYeuCauKhac: item.normalizedYeuCauKhac,
        normalizedExpansionSearchText: (item as { normalizedExpansionSearchText?: string | null })
          .normalizedExpansionSearchText,
        donVi: item.donVi,
      },
      { includeDebug: process.env.DEBUG_BOQ_SCORING === "1" }
    );

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
      normalizedPrimarySearchText: item.normalizedPrimarySearchText ?? null,
      normalizedSearchText: item.normalizedSearchText ?? null,
      donVi: item.donVi,
      pricePeriodCode: selectedPrice?.pricePeriodCode ?? null,
      pricePeriodLabel: selectedPrice?.pricePeriodLabel ?? null,
      vatTu: selectedPrice?.vatTu?.toString() ?? null,
      thiCong: selectedPrice?.thiCong?.toString() ?? null,
      tongCong: selectedPrice?.tongCong?.toString() ?? null,
      linkHdThamKhao: selectedPrice?.linkHdThamKhao ?? null,
      ghiChu: selectedPrice?.ghiChu ?? null,
      scoreBreakdown: ranking.breakdown,
      ...(ranking.debug ? { scoreDebug: ranking.debug } : {}),
    };
  });

  let sorted = scored.sort((a, b) => {
    if (queryHasCm) {
      const ca = smallestQuyCmCap(a.quyCachKyThuat);
      const cb = smallestQuyCmCap(b.quyCachKyThuat);
      if (ca != null && cb != null && ca !== cb) return ca - cb;
      if (ca != null && cb == null) return -1;
      if (ca == null && cb != null) return 1;
    }
    return b.score - a.score;
  });

  if (sorted.length > 0) {
    const feedbackKey = normalizeFeedbackLookupKey(scoringQueryRaw);
    const feedbackSig = buildQuerySignature(scoringQueryRaw);
    try {
      const boostMap = await getFeedbackBoostDetailMap(
        feedbackKey,
        feedbackSig,
        selectedPricePeriodCode ?? null
      );
      sorted = applyFeedbackBoostAndResort(sorted, boostMap, queryHasCm);
    } catch {
      /* Feedback is optional — keep lexical ranking if DB/read fails. */
    }
  }

  const totalMatched = sorted.length;
  const maxResults = options?.maxResults ?? 5;

  if (
    totalMatched === 0 &&
    !options?.skipReducedQueryFallback &&
    normalizedRetrievalQuery.trim().length >= 2
  ) {
    const reducedList = buildReducedSearchQueries(normalizedRetrievalQuery);
    for (const subQ of reducedList) {
      const retry = await searchItems(subQ, selectedPricePeriodCode, {
        ...options,
        skipReducedQueryFallback: true,
        scoringQueryOverride: options?.scoringQueryOverride ?? query,
      });
      if (retry.totalMatched > 0) {
        return retry;
      }
    }
  }

  const searchFeedbackMeta = await loadSearchFeedbackMetaSafe(
    scoringQueryRaw,
    selectedPricePeriodCode
  );
  const latestSearchSelection = await loadLatestSearchSelectionSafe(
    scoringQueryRaw,
    selectedPricePeriodCode
  );

  const noSuitableSelectedByMeta = shouldEmptyResultsForNoSuitableMeta(
    searchFeedbackMeta,
    options?.skipNoSuitableMetaEmptyOverride
  );

  if (noSuitableSelectedByMeta) {
    return {
      results: [],
      totalMatched: 0,
      searchFeedbackMeta,
      ...(latestSearchSelection !== undefined
        ? { latestSearchSelection }
        : {}),
      noSuitableResultSelected: true,
    };
  }

  return {
    results: sorted.slice(0, maxResults),
    totalMatched,
    ...(searchFeedbackMeta != null ? { searchFeedbackMeta } : {}),
    ...(latestSearchSelection !== undefined
      ? { latestSearchSelection }
      : {}),
  };
}

/**
 * Load one BOQ row as `SearchResult` for the same latest import batch + price period rules as `searchItems`.
 * Used only when feedback points at an id not present in the current ranked slice (no fake rows).
 */
async function fetchSearchResultByBoqItemId(
  boqItemId: string,
  scoringQueryRaw: string,
  selectedPricePeriodCode?: string
): Promise<SearchResult | null> {
  const id = boqItemId.trim();
  if (!id) return null;
  const periodFilter = Boolean(selectedPricePeriodCode?.trim());
  const latestBatch = await prisma.importBatch.findFirst({
    where: {
      completedAt: { not: null },
      ...(periodFilter && selectedPricePeriodCode
        ? { pricePeriodCode: selectedPricePeriodCode.trim() }
        : {}),
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (!latestBatch) return null;

  const item = await prisma.boqItem.findFirst({
    where: {
      id,
      importBatchId: latestBatch.id,
      isActive: true,
      isSearchable: true,
      ...(periodFilter && selectedPricePeriodCode
        ? {
            prices: {
              some: { pricePeriodCode: selectedPricePeriodCode.trim() },
            },
          }
        : {}),
    },
    include: {
      prices: {
        orderBy: { pricePeriodCode: "asc" },
      },
    },
  });
  if (!item) return null;

  const normalizedScoringQuery = normalizeQuery(scoringQueryRaw.trim());
  const ranking = calculateScore(
    normalizedScoringQuery,
    {
      normalizedSearchText: item.normalizedSearchText,
      normalizedNoiDungCongViec: item.normalizedNoiDungCongViec,
      normalizedNhomCongTac: item.normalizedNhomCongTac,
      normalizedQuyCachKyThuat: item.normalizedQuyCachKyThuat,
      normalizedYeuCauKhac: item.normalizedYeuCauKhac,
      normalizedExpansionSearchText: (item as {
        normalizedExpansionSearchText?: string | null;
      }).normalizedExpansionSearchText,
      donVi: item.donVi,
    },
    { includeDebug: process.env.DEBUG_BOQ_SCORING === "1" }
  );

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
    normalizedPrimarySearchText: item.normalizedPrimarySearchText ?? null,
    normalizedSearchText: item.normalizedSearchText ?? null,
    donVi: item.donVi,
    pricePeriodCode: selectedPrice?.pricePeriodCode ?? null,
    pricePeriodLabel: selectedPrice?.pricePeriodLabel ?? null,
    vatTu: selectedPrice?.vatTu?.toString() ?? null,
    thiCong: selectedPrice?.thiCong?.toString() ?? null,
    tongCong: selectedPrice?.tongCong?.toString() ?? null,
    linkHdThamKhao: selectedPrice?.linkHdThamKhao ?? null,
    ghiChu: selectedPrice?.ghiChu ?? null,
    scoreBreakdown: ranking.breakdown,
    ...(ranking.debug ? { scoreDebug: ranking.debug } : {}),
  };
}

function sliceResultsToMax<T>(arr: T[], maxResults: number): T[] {
  if (!Number.isFinite(maxResults) || maxResults < 0) return arr;
  return arr.slice(0, maxResults);
}

/**
 * After `searchItems`, apply the latest explicit feedback row: reorder / prepend from DB,
 * or empty when latest is “no suitable”. Individual latest overrides collective meta emptying
 * when the user later picked a concrete BOQ.
 */
export async function applyLatestSearchSelectionToPayload(
  query: string,
  selectedPricePeriodCode: string | undefined,
  payload: SearchItemsPayload,
  maxResults: number = 5
): Promise<SearchItemsPayload> {
  const scoringQueryRaw = query.trim();
  const latest = await getLatestSearchSelection(
    scoringQueryRaw,
    selectedPricePeriodCode ?? null
  );

  if (latest?.type === "no_suitable_result") {
    return {
      ...payload,
      results: [],
      totalMatched: 0,
      noSuitableResultSelected: true,
    };
  }

  if (latest?.type !== "boq_item") {
    return payload;
  }

  const id = latest.boqItemId;
  const inList = payload.results.find((r) => r.itemId === id);
  if (inList) {
    const rest = payload.results.filter((r) => r.itemId !== id);
    return {
      ...payload,
      results: sliceResultsToMax([inList, ...rest], maxResults),
      noSuitableResultSelected: false,
    };
  }

  const fetched = await fetchSearchResultByBoqItemId(
    id,
    scoringQueryRaw,
    selectedPricePeriodCode
  );
  if (!fetched) {
    return payload;
  }

  const rest = payload.results.filter((r) => r.itemId !== fetched.itemId);
  const merged = [fetched, ...rest];
  const impliesMorePages = payload.totalMatched > payload.results.length;
  const newTotal = impliesMorePages
    ? payload.totalMatched
    : payload.totalMatched + 1;

  return {
    ...payload,
    results: sliceResultsToMax(merged, maxResults),
    totalMatched: newTotal,
    noSuitableResultSelected: false,
  };
}

/**
 * Lexical `searchItems` then feedback-based preferred restore for main `/api/search` (and batch).
 */
export async function searchItemsWithLatestSelectionRestore(
  query: string,
  selectedPricePeriodCode?: string,
  options?: SearchItemsOptions
): Promise<SearchItemsPayload> {
  const payload = await searchItems(query, selectedPricePeriodCode, options);
  const maxCap =
    options?.maxResults !== undefined ? options.maxResults : 5;
  return applyLatestSearchSelectionToPayload(
    query,
    selectedPricePeriodCode,
    payload,
    maxCap
  );
}