import { prisma } from "../db/prisma";

export {
  VIRTUAL_NO_SUITABLE_CANDIDATE_KEY,
  isReservedVirtualFeedbackBoqId,
} from "./feedback-virtual-constants";

const NO_SUITABLE_FETCH_CAP = 500;

export type NoSuitableSignal = {
  exactNoSuitableCount: number;
  signatureNoSuitableCount: number;
  /** Sum of `Math.abs(weight)` for matched rows (weights are negative for this action). */
  totalNoSuitableWeight: number;
};

/**
 * Aggregates `no_suitable_result` feedback for the current normalized query and optional
 * query signature (cross-keyword weak-set signal). Does not touch BOQ rows.
 */
export async function getNoSuitableSignal(
  normalizedQuery: string,
  querySignature: string,
  pricePeriodCode?: string | null
): Promise<NoSuitableSignal> {
  const key = normalizedQuery.trim();
  const sig = querySignature.trim();
  if (!key) {
    return {
      exactNoSuitableCount: 0,
      signatureNoSuitableCount: 0,
      totalNoSuitableWeight: 0,
    };
  }

  const period = pricePeriodCode?.trim() ?? "";
  const orBranches: { normalizedQuery?: string; querySignature?: string }[] = [
    { normalizedQuery: key },
  ];
  if (sig.length > 0) {
    orBranches.push({ querySignature: sig });
  }

  const andParts: object[] = [
    { action: "no_suitable_result" },
    { OR: orBranches },
  ];
  if (period.length > 0) {
    andParts.push({
      OR: [{ pricePeriodCode: null }, { pricePeriodCode: period }],
    });
  }

  const rows = await prisma.searchFeedback.findMany({
    where: { AND: andParts },
    orderBy: { createdAt: "desc" },
    take: NO_SUITABLE_FETCH_CAP,
    select: {
      normalizedQuery: true,
      querySignature: true,
      weight: true,
    },
  });

  let exactNoSuitableCount = 0;
  let signatureNoSuitableCount = 0;
  let totalNoSuitableWeight = 0;

  for (const r of rows) {
    totalNoSuitableWeight += Math.abs(r.weight);
    if (r.normalizedQuery === key) {
      exactNoSuitableCount += 1;
    } else if (
      sig.length > 0 &&
      r.querySignature === sig &&
      r.normalizedQuery !== key
    ) {
      signatureNoSuitableCount += 1;
    }
  }

  return {
    exactNoSuitableCount,
    signatureNoSuitableCount,
    totalNoSuitableWeight,
  };
}

/** Attached to `searchItems` JSON for clients / future admin (no ranking side-effects). */
export type SearchFeedbackMeta = {
  noSuitableResultCount: number;
  noSuitableResultSignatureCount: number;
  searchQualityWarning: boolean;
  searchQualityReason?: string;
  /** Sum of `abs(weight)` over sampled no-suitable rows (for tuning / dashboards). */
  totalNoSuitableWeight?: number;
};

const QUALITY_WARNING_MIN_EXACT = 3;

export async function buildSearchFeedbackMeta(
  normalizedQueryKey: string,
  querySignature: string,
  pricePeriodCode?: string | null
): Promise<SearchFeedbackMeta> {
  const signal = await getNoSuitableSignal(
    normalizedQueryKey,
    querySignature,
    pricePeriodCode
  );
  const searchQualityWarning =
    signal.exactNoSuitableCount >= QUALITY_WARNING_MIN_EXACT;
  return {
    noSuitableResultCount: signal.exactNoSuitableCount,
    noSuitableResultSignatureCount: signal.signatureNoSuitableCount,
    searchQualityWarning,
    totalNoSuitableWeight: signal.totalNoSuitableWeight,
    ...(searchQualityWarning
      ? {
          searchQualityReason:
            "Multiple users marked these results as not suitable",
        }
      : {}),
  };
}
