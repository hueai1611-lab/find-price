import { prisma } from "../db/prisma";

export type NoSuitableCandidateRow = {
  normalizedQuery: string;
  querySignature: string | null;
  reportCount: number;
  totalWeightAbs: number;
};

/**
 * Keywords / signatures where users most often picked the virtual
 * “no suitable result” candidate (not a BOQ id).
 */
export async function getTopNoSuitableCandidates(
  limit = 20
): Promise<NoSuitableCandidateRow[]> {
  const rows = await prisma.searchFeedback.findMany({
    where: { action: "no_suitable_result" },
    orderBy: { createdAt: "desc" },
    take: 3000,
    select: {
      normalizedQuery: true,
      querySignature: true,
      weight: true,
    },
  });

  const byKey = new Map<
    string,
    { normalizedQuery: string; querySignature: string | null; count: number; w: number }
  >();

  for (const r of rows) {
    const sig = r.querySignature?.trim() || null;
    const key = sig ? `sig:${sig}` : `nq:${r.normalizedQuery}`;
    const prev = byKey.get(key);
    const w = Math.abs(r.weight);
    if (prev) {
      prev.count += 1;
      prev.w += w;
    } else {
      byKey.set(key, {
        normalizedQuery: r.normalizedQuery,
        querySignature: sig,
        count: 1,
        w,
      });
    }
  }

  const out: NoSuitableCandidateRow[] = Array.from(byKey.values()).map((v) => ({
    normalizedQuery: v.normalizedQuery,
    querySignature: v.querySignature,
    reportCount: v.count,
    totalWeightAbs: v.w,
  }));
  out.sort((a, b) => b.reportCount - a.reportCount);
  return out.slice(0, limit);
}

/** Admin / debug: queries with the most "no suitable" reports. */
export async function getTopNoSuitableQueries(limit = 20) {
  return prisma.searchFeedback.groupBy({
    by: ["normalizedQuery"],
    where: { action: "no_suitable_result" },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });
}

type AmbiguousRow = { key: string; distinctItems: number; sampleSignature: string | null };

/**
 * Signatures (or normalized query when signature is null) where users selected
 * at least two different BOQ items — useful for admin review.
 */
export async function getTopAmbiguousQueries(limit = 20): Promise<AmbiguousRow[]> {
  const rows = await prisma.searchFeedback.findMany({
    where: {
      action: { in: ["select", "click"] },
      boqItemId: { not: null },
      weight: { gt: 0 },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      normalizedQuery: true,
      querySignature: true,
      boqItemId: true,
    },
  });

  const byKey = new Map<string, Set<string>>();
  const sigByKey = new Map<string, string | null>();

  for (const r of rows) {
    const key =
      r.querySignature && r.querySignature.trim() !== ""
        ? `sig:${r.querySignature}`
        : `nq:${r.normalizedQuery}`;
    if (!r.boqItemId) continue;
    let set = byKey.get(key);
    if (!set) {
      set = new Set();
      byKey.set(key, set);
      sigByKey.set(
        key,
        r.querySignature && r.querySignature.trim() !== ""
          ? r.querySignature
          : null
      );
    }
    set.add(r.boqItemId);
  }

  const scored: AmbiguousRow[] = [];
  for (const [key, set] of byKey) {
    if (set.size < 2) continue;
    scored.push({
      key,
      distinctItems: set.size,
      sampleSignature: sigByKey.get(key) ?? null,
    });
  }
  scored.sort((a, b) => b.distinctItems - a.distinctItems);
  return scored.slice(0, limit);
}
