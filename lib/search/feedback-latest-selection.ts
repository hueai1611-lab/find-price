import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma";
import {
  isReservedVirtualFeedbackBoqId,
  VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
} from "./feedback-virtual-constants";
import { normalizeFeedbackLookupKey } from "./feedback-lookup-key";
import { buildQuerySignature } from "./query-signature";

/** Latest explicit user choice for main /search display (never injects virtual BOQ rows). */
export type SearchLatestSelectionResult =
  | { type: "selected_item"; boqItemId: string; createdAt: Date }
  | { type: "no_suitable_result"; createdAt: Date };

/** JSON-safe shape for API + session draft. */
export type SearchLatestSelectionDTO =
  | { type: "selected_item"; boqItemId: string; createdAt?: string }
  /** Legacy name; treat like `selected_item` when reading. */
  | { type: "boq_item"; boqItemId: string; createdAt?: string }
  | { type: "no_suitable_result"; createdAt?: string };

/** Scope: normalizedQuery (+ optional kỳ giá: null period hoặc đúng kỳ). */
function buildLatestFeedbackScope(
  normalizedQueryKey: string,
  pricePeriodCode?: string | null
): Prisma.SearchFeedbackWhereInput {
  const period = (pricePeriodCode ?? '').trim();
  if (!period) {
    return { normalizedQuery: normalizedQueryKey };
  }
  return {
    AND: [
      { normalizedQuery: normalizedQueryKey },
      {
        OR: [{ pricePeriodCode: null }, { pricePeriodCode: period }],
      },
    ],
  };
}

function selectionWhere(
  scope: Prisma.SearchFeedbackWhereInput
): Prisma.SearchFeedbackWhereInput {
  return {
    AND: [
      scope,
      {
        OR: [
          { action: "select", boqItemId: { not: null } },
          {
            action: "no_suitable_result",
            virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
          },
          {
            action: "no_suitable_result",
            virtualCandidateKey: null,
          },
          {
            AND: [
              { virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY },
              { boqItemId: null },
            ],
          },
        ],
      },
    ],
  };
}

function rowToResult(row: {
  action: string;
  boqItemId: string | null;
  virtualCandidateKey: string | null;
  createdAt: Date;
}): SearchLatestSelectionResult | null {
  const vk = row.virtualCandidateKey?.trim() ?? null;
  const boqEmpty = row.boqItemId == null || row.boqItemId === "";

  // Reserved virtual marker with no BOQ id — treat as no-suitable even if `action` is wrong.
  if (vk === VIRTUAL_NO_SUITABLE_CANDIDATE_KEY && boqEmpty) {
    return { type: "no_suitable_result", createdAt: row.createdAt };
  }

  if (row.action === "no_suitable_result") {
    if (vk != null && vk !== "" && vk !== VIRTUAL_NO_SUITABLE_CANDIDATE_KEY) {
      return null;
    }
    return { type: "no_suitable_result", createdAt: row.createdAt };
  }

  if (row.action === "select" && row.boqItemId) {
    if (isReservedVirtualFeedbackBoqId(row.boqItemId)) return null;
    return { type: "selected_item", boqItemId: row.boqItemId, createdAt: row.createdAt };
  }
  return null;
}

async function findLatestUnderScope(
  scope: Prisma.SearchFeedbackWhereInput
): Promise<SearchLatestSelectionResult | null> {
  const rows = await prisma.searchFeedback.findMany({
    where: selectionWhere(scope),
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      action: true,
      boqItemId: true,
      virtualCandidateKey: true,
      createdAt: true,
    },
  });
  for (const r of rows) {
    const mapped = rowToResult(r);
    if (mapped) return mapped;
  }
  return null;
}

/** DB chưa migration `virtualCandidateKey`: WHERE/SELECT không được tham chiếu cột đó. */
function selectionWhereLegacyNoVirtualColumn(
  scope: Prisma.SearchFeedbackWhereInput
): Prisma.SearchFeedbackWhereInput {
  return {
    AND: [
      scope,
      {
        OR: [
          { action: "select", boqItemId: { not: null } },
          { action: "no_suitable_result" },
        ],
      },
    ],
  };
}

async function findLatestUnderScopeLegacy(
  scope: Prisma.SearchFeedbackWhereInput
): Promise<SearchLatestSelectionResult | null> {
  const rows = await prisma.searchFeedback.findMany({
    where: selectionWhereLegacyNoVirtualColumn(scope),
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      action: true,
      boqItemId: true,
      createdAt: true,
    },
  });
  for (const r of rows) {
    const mapped = rowToResult({
      action: r.action,
      boqItemId: r.boqItemId,
      virtualCandidateKey: null,
      createdAt: r.createdAt,
    });
    if (mapped) return mapped;
  }
  return null;
}

/**
 * Latest explicit selection for this query context: `select` (real BOQ) or
 * `no_suitable_result` (virtual).
 *
 * Uses **strict** `normalizedQuery` only. A `querySignature`-only fallback was removed:
 * it could return another keyword’s newer `select` and hide a valid `no_suitable_result`
 * for the current line (main `/search` restore).
 */
async function findLatestSearchSelectionNormalized(
  normalizedQuery: string,
  _querySignature: string,
  pricePeriodCode?: string | null
): Promise<SearchLatestSelectionResult | null> {
  const key = normalizedQuery.trim();
  if (!key) return null;

  const scope = buildLatestFeedbackScope(key, pricePeriodCode);
  try {
    return await findLatestUnderScope(scope);
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2022"
    ) {
      return findLatestUnderScopeLegacy(scope);
    }
    throw e;
  }
}

/** Shape used after lexical `searchItems` for preferred-result restore. */
export type LatestSearchSelection =
  | { type: "boq_item"; boqItemId: string }
  | {
      type: "no_suitable_result";
      virtualCandidateKey: typeof VIRTUAL_NO_SUITABLE_CANDIDATE_KEY;
    };

/**
 * Latest saved feedback for this raw keyword + price period (normalized key + period scope).
 */
export async function getLatestSearchSelection(
  query: string,
  pricePeriodCode?: string | null
): Promise<LatestSearchSelection | null> {
  const row = await getLatestSearchSelectionForRawQuery(query, pricePeriodCode);
  if (row == null) return null;
  if (row.type === "no_suitable_result") {
    return {
      type: "no_suitable_result",
      virtualCandidateKey: VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
    };
  }
  return { type: "boq_item", boqItemId: row.boqItemId };
}

export async function getLatestSearchSelectionForRawQuery(
  rawQuery: string,
  pricePeriodCode?: string | null
): Promise<SearchLatestSelectionResult | null> {
  const nq = normalizeFeedbackLookupKey(rawQuery);
  const sig = buildQuerySignature(rawQuery);
  return findLatestSearchSelectionNormalized(nq, sig, pricePeriodCode);
}

export function latestSelectionToDto(
  r: SearchLatestSelectionResult | null
): SearchLatestSelectionDTO | null {
  if (r == null) return null;
  if (r.type === "no_suitable_result") {
    return {
      type: "no_suitable_result",
      createdAt: r.createdAt.toISOString(),
    };
  }
  return {
    type: "selected_item",
    boqItemId: r.boqItemId,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function getLatestSearchSelectionsForRawQueries(
  rawQueries: string[],
  pricePeriodCode?: string | null
): Promise<Map<string, SearchLatestSelectionResult | null>> {
  const out = new Map<string, SearchLatestSelectionResult | null>();
  await Promise.all(
    rawQueries.map(async (q) => {
      const sel = await getLatestSearchSelectionForRawQuery(q, pricePeriodCode);
      out.set(q, sel);
    })
  );
  return out;
}
