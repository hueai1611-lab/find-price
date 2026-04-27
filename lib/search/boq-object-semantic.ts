/**
 * Object-first BOQ signals: main sanitary / fixture intent vs stone hole-cutting & supporting work.
 * All matching uses normalized ASCII (same as `normalizeBaseSearchString`).
 */

import type { Prisma } from "@prisma/client";

export type BoqObjectDomain =
  | "NONE"
  | "SANITARY_FIXTURE"
  | "SANITARY_FAUCET"
  | "ACCESSIBILITY"
  | "STONE_WORK"
  | "STONE_FINISH";

export type BoqWorkIntent = "main_product" | "supporting_work" | "mixed" | "unknown";

export type QueryObjectProfile = {
  domains: BoqObjectDomain[];
  domainLabel: string;
  facet: "SINK" | "FAUCET" | "GENERIC" | null;
  accessibility: boolean;
  /** User asks for đá / khoét lỗ / mặt bàn đá — do not penalise stone rows. */
  stoneOrHoleWorkIntent: boolean;
  workIntent: BoqWorkIntent;
};

export type RowObjectProfile = {
  domains: BoqObjectDomain[];
  domainLabel: string;
  workIntent: BoqWorkIntent;
  stoneHoleSinkSupporting: boolean;
};

const SANITARY_FIXTURE_RE =
  /\b(chau\s+rua|chau\s+rua\s+lavabo|lavabo|bon\s+rua|bon\s+chau|thiet\s+bi\s+ve\s+sinh|wc\s+ngoi|bon\s+cau|chau\s+tieu)\b/i;

const SANITARY_FAUCET_RE =
  /\b(voi\s+chau\s+rua|voi\s+lavabo|voi\s+rua|voi\s+bon\s+rua|voi\s+sen|sen\s+voi|voi\s+nong\s+lanh)\b/i;

function faucetIntentFromTokens(q: string): boolean {
  if (SANITARY_FAUCET_RE.test(q)) return true;
  return /\bvoi\b/i.test(q) && /\b(chau\s+rua|lavabo|bon\s+rua)\b/i.test(q);
}

const ACCESSIBILITY_RE =
  /\b(tan\s*tat|khuyet\s*tat|nguoi\s+tan\s*tat|nguoi\s+khuyet\s+tat|nguoi\s+khuyet\s*tat|accessible|disabled)\b/i;

const STONE_OR_HOLE_QUERY_INTENT_RE =
  /\b(khoet\s+lo|khoan\s+lo|cat\s+lo|cat\s+da|da\s+op|mat\s+da|mat\s+ban|mat\s+ban\s+da|lo\s+chau\s+rua|lo\s+lavabo|ban\s+da|da\s+tu\s+nhien)\b/i;

const STONE_WORK_ROW_RE =
  /\b(da\s+op|op\s+lat\s+da|mat\s+da|mat\s+ban\s+da|ban\s+da|da\s+granite|da\s+marble|da\s+tu\s+nhien)\b/i;

const STONE_NHOM_HINT = /^(da|da\s+tu\s+nhien|da\s+op|mat\s+da)\b/i;

const HOLE_CUTTING_ROW_RE =
  /\b(khoet\s+lo|khoan\s+lo|cat\s+lo|khoet\s+cat|gia\s+cong\s+da|cat\s+da)\b/i;

const STONE_HOLE_SINK_SUPPORTING_RE =
  /\b(khoet\s+lo|khoan\s+lo|cat\s+lo)\b[\s\S]{0,160}\b(lavabo|chau\s+rua)\b|\b(lavabo|chau\s+rua)\b[\s\S]{0,160}\b(khoet\s+lo|khoan\s+lo|cat\s+lo)\b/i;

const SUPPORTING_WORK_ROW_RE =
  /\b(khoet\s+lo|cat\s+lo|khoan\s+lo|gia\s+cong|cat\s+vien|cat\s+gach|mai\s+canh|xu\s+ly\s+canh|phu\s+kien|boc\s+xep|van\s+chuyen|thao\s+do|pha\s+do)\b/i;

const MAIN_SANITARY_SUPPLY_ROW_RE =
  /\b(lap\s+dat|cung\s+cap|mua\s+sam|thi\s+cong\s+lap|hoan\s+thien\s+noi\s+that|san\s+pham)\b[\s\S]{0,120}\b(chau\s+rua|lavabo|voi)\b|\b(chau\s+rua|lavabo)\b[\s\S]{0,120}\b(lap\s+dat|cung\s+cap|nguoi\s+khuyet|tan\s*tat|khuyet\s*tat)\b/i;

function uniqDomains(d: BoqObjectDomain[]): BoqObjectDomain[] {
  const out: BoqObjectDomain[] = [];
  const seen = new Set<BoqObjectDomain>();
  for (const x of d) {
    if (x === "NONE" || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out.length ? out : ["NONE"];
}

function facetFromQuery(q: string, hasFixture: boolean, hasFaucet: boolean): QueryObjectProfile["facet"] {
  const faucetLeading =
    /^\s*voi\b/i.test(q) ||
    (hasFaucet &&
      hasFixture &&
      (() => {
        const iv = q.search(/\bvoi\b/i);
        const ic = q.search(/\b(chau\s+rua|lavabo)\b/i);
        return iv >= 0 && ic >= 0 && iv < ic;
      })());
  if (faucetLeading && hasFaucet) return "FAUCET";
  if (hasFixture && !hasFaucet) return "SINK";
  if (!hasFixture && hasFaucet) return "FAUCET";
  if (hasFixture && hasFaucet) return "GENERIC";
  return null;
}

function domainLabelFrom(
  domains: BoqObjectDomain[],
  facet: QueryObjectProfile["facet"],
  accessibility: boolean
): string {
  const base = domains.join("+");
  if (facet === "SINK" && domains.includes("SANITARY_FIXTURE"))
    return accessibility ? "SANITARY_FIXTURE+ACCESSIBILITY(SINK)" : "SANITARY_FIXTURE(SINK)";
  if (facet === "FAUCET" && domains.includes("SANITARY_FAUCET"))
    return accessibility ? "SANITARY_FAUCET+ACCESSIBILITY(FAUCET)" : "SANITARY_FAUCET(FAUCET)";
  if (accessibility && base.includes("ACCESSIBILITY")) return base;
  return base || "NONE";
}

export function detectQueryObjectProfile(queryNorm: string): QueryObjectProfile {
  const q = queryNorm.trim();
  const domains: BoqObjectDomain[] = [];
  const accessibility = ACCESSIBILITY_RE.test(q);
  const stoneOrHoleWorkIntent = STONE_OR_HOLE_QUERY_INTENT_RE.test(q);

  const hasFixture = SANITARY_FIXTURE_RE.test(q);
  const hasFaucet = faucetIntentFromTokens(q);

  if (accessibility) domains.push("ACCESSIBILITY");
  if (hasFaucet) domains.push("SANITARY_FAUCET");
  if (hasFixture) domains.push("SANITARY_FIXTURE");

  const facet = facetFromQuery(q, hasFixture, hasFaucet);
  const ud = uniqDomains(domains);
  const domainLabel = domainLabelFrom(ud, facet, accessibility);

  let workIntent: BoqWorkIntent = "unknown";
  if (stoneOrHoleWorkIntent) workIntent = "supporting_work";
  else if (hasFixture || hasFaucet) workIntent = "main_product";

  return {
    domains: ud,
    domainLabel,
    facet,
    accessibility,
    stoneOrHoleWorkIntent,
    workIntent,
  };
}

function rowBlob(nhom: string, noiDung: string, quy: string): string {
  return [nhom, noiDung, quy].filter(Boolean).join(" · ");
}

export function detectRowObjectProfile(
  nhom: string,
  noiDung: string,
  quy: string
): RowObjectProfile {
  const blob = rowBlob(nhom, noiDung, quy);
  const domains: BoqObjectDomain[] = [];

  const stoneNhom = STONE_NHOM_HINT.test(nhom.trim());
  const stoneBlob = STONE_WORK_ROW_RE.test(blob) || stoneNhom;
  const hole = HOLE_CUTTING_ROW_RE.test(blob);
  const stoneHoleSink =
    STONE_HOLE_SINK_SUPPORTING_RE.test(blob) ||
    (hole && /\b(lavabo|chau\s+rua)\b/i.test(blob) && stoneBlob);

  if (stoneBlob || /\bda\b/i.test(nhom.trim())) domains.push("STONE_WORK");
  if (/\b(op\s+lat|lat\s+nen|gach\s+op)\b/i.test(blob)) domains.push("STONE_FINISH");

  const hasSanitaryLex = SANITARY_FIXTURE_RE.test(blob) || SANITARY_FAUCET_RE.test(blob);
  if (hasSanitaryLex && (!stoneHoleSink || MAIN_SANITARY_SUPPLY_ROW_RE.test(blob))) {
    if (SANITARY_FAUCET_RE.test(blob)) domains.push("SANITARY_FAUCET");
    if (SANITARY_FIXTURE_RE.test(blob)) domains.push("SANITARY_FIXTURE");
  }
  if (ACCESSIBILITY_RE.test(blob)) domains.push("ACCESSIBILITY");

  const uniq = uniqDomains(domains);

  let workIntent: BoqWorkIntent = "unknown";
  if (stoneHoleSink) workIntent = "supporting_work";
  else if (SUPPORTING_WORK_ROW_RE.test(blob) && !MAIN_SANITARY_SUPPLY_ROW_RE.test(blob)) {
    workIntent = "supporting_work";
  } else if (MAIN_SANITARY_SUPPLY_ROW_RE.test(blob) || (hasSanitaryLex && !hole)) {
    workIntent = "main_product";
  } else if (hasSanitaryLex && hole) {
    workIntent = "mixed";
  }

  const domainLabel = `${uniq.join("+") || "NONE"}·${workIntent}`;

  return {
    domains: uniq,
    domainLabel,
    workIntent,
    stoneHoleSinkSupporting: stoneHoleSink,
  };
}

const STRONG_COMPAT_BOOST = 28;
const WEAK_COMPAT_BOOST = 12;
const STRONG_CONFLICT_PENALTY = -72;
const SOFT_CONFLICT_PENALTY = -26;

function queryWantsSanitaryMain(p: QueryObjectProfile): boolean {
  return (
    p.workIntent === "main_product" &&
    (p.domains.includes("SANITARY_FIXTURE") || p.domains.includes("SANITARY_FAUCET")) &&
    !p.stoneOrHoleWorkIntent
  );
}

function rowIsSanitaryMain(r: RowObjectProfile): boolean {
  return (
    (r.domains.includes("SANITARY_FIXTURE") || r.domains.includes("SANITARY_FAUCET")) &&
    r.workIntent !== "supporting_work" &&
    !r.stoneHoleSinkSupporting
  );
}

export type ObjectCompatibilityResult = {
  delta: number;
  conflict: boolean;
  strongConflict: boolean;
  queryLabel: string;
  rowLabel: string;
  queryWorkIntent: BoqWorkIntent;
  rowWorkIntent: BoqWorkIntent;
};

export function scoreObjectDomainCompatibility(
  queryNorm: string,
  row: { nhom: string; noiDung: string; quy: string }
): ObjectCompatibilityResult {
  const qProfile = detectQueryObjectProfile(queryNorm);
  const rProfile = detectRowObjectProfile(row.nhom, row.noiDung, row.quy);
  const blob = rowBlob(row.nhom, row.noiDung, row.quy);

  let delta = 0;
  let conflict = false;
  let strongConflict = false;

  if (queryWantsSanitaryMain(qProfile) && !qProfile.stoneOrHoleWorkIntent) {
    const stoneHoleConflict =
      rProfile.stoneHoleSinkSupporting ||
      (rProfile.domains.includes("STONE_WORK") &&
        rProfile.workIntent === "supporting_work" &&
        HOLE_CUTTING_ROW_RE.test(blob) &&
        /\b(lavabo|chau\s+rua)\b/i.test(blob));

    if (stoneHoleConflict) {
      delta += STRONG_CONFLICT_PENALTY;
      conflict = true;
      strongConflict = true;
    }

    if (rowIsSanitaryMain(rProfile)) {
      if (qProfile.accessibility && rProfile.domains.includes("ACCESSIBILITY")) {
        delta += STRONG_COMPAT_BOOST;
      } else if (qProfile.accessibility && ACCESSIBILITY_RE.test(blob)) {
        delta += STRONG_COMPAT_BOOST;
      } else {
        delta += WEAK_COMPAT_BOOST;
      }

      if (qProfile.facet === "FAUCET" && !rProfile.domains.includes("SANITARY_FAUCET")) {
        delta += SOFT_CONFLICT_PENALTY;
        conflict = true;
      }
      if (
        qProfile.facet === "SINK" &&
        rProfile.domains.includes("SANITARY_FAUCET") &&
        !rProfile.domains.includes("SANITARY_FIXTURE")
      ) {
        delta += SOFT_CONFLICT_PENALTY;
        conflict = true;
      }
    }
  }

  if (qProfile.stoneOrHoleWorkIntent && rProfile.domains.includes("STONE_WORK")) {
    delta += WEAK_COMPAT_BOOST;
  }

  return {
    delta,
    conflict,
    strongConflict,
    queryLabel: qProfile.domainLabel,
    rowLabel: rProfile.domainLabel,
    queryWorkIntent: qProfile.workIntent,
    rowWorkIntent: rProfile.workIntent,
  };
}

function phraseContainedInNormalizedQuery(normQ: string, phrase: string): boolean {
  const compact = normQ.replace(/\s+/g, "");
  const p = phrase.replace(/\s+/g, "");
  return compact.includes(p) || normQ.includes(phrase);
}

/** Optional extra OR-branches for recall (sanitary + accessibility only). */
export function buildObjectRetrievalOrBranches(normalizedQuery: string): Prisma.BoqItemWhereInput[] {
  const p = detectQueryObjectProfile(normalizedQuery);
  if (!queryWantsSanitaryMain(p) || !p.accessibility) return [];

  const phrases: string[] = [];
  if (p.domains.includes("SANITARY_FAUCET") || p.facet === "FAUCET") {
    phrases.push("voi lavabo", "voi chau rua", "thiet bi ve sinh");
  }
  if (p.domains.includes("SANITARY_FIXTURE") || p.facet === "SINK" || p.facet === "GENERIC") {
    phrases.push("lavabo", "chau rua", "thiet bi ve sinh", "khuyet tat", "tan tat");
  }

  const seen = new Set<string>();
  const branches: Prisma.BoqItemWhereInput[] = [];
  for (const ph of phrases) {
    const key = ph.toLowerCase();
    if (seen.has(key) || phraseContainedInNormalizedQuery(normalizedQuery, ph)) continue;
    if (ph.replace(/\s+/g, "").length < 4) continue;
    seen.add(key);
    branches.push({
      OR: [
        {
          normalizedPrimarySearchText: {
            contains: ph,
            mode: "insensitive" as const,
          },
        },
        {
          ["normalizedExpansionSearchText"]: {
            contains: ph,
            mode: "insensitive" as const,
          },
        },
      ],
    } as Prisma.BoqItemWhereInput);
  }
  return branches;
}
