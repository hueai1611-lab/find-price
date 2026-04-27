/**
 * Regression: ốp chân tường / porcelain query should rank main m2 line above auxiliary md.
 *
 * Run (requires DB + import batch for Q2_2026):
 *   npx tsx scripts/regression-boq-op-chan-tuong.ts
 *
 * Optional verbose scoring:
 *   DEBUG_BOQ_SCORING=1 npx tsx scripts/regression-boq-op-chan-tuong.ts
 */
import "dotenv/config";

import { normalizeBaseSearchString } from "../lib/search/boq-search-normalize";
import { searchItems } from "../lib/search/search-service";

const QUERY =
  "Công tác ốp gạch vào chân tường, viền tường, viền trụ, cột bằng Gạch Porcelain KT 600x100";
const PERIOD = "Q2_2026";

async function main() {
  const r = await searchItems(QUERY, PERIOD, { maxResults: 15 });
  const top = r.results[0];
  if (!top) {
    console.error("No results");
    process.exit(1);
  }

  const ndN = normalizeBaseSearchString(top.noiDungCongViec ?? "");
  const aux = /\bgia\s*cong\b/i.test(ndN);
  const mainLike =
    /op.*chan.*tuong|chan.*tuong|vien.*tuong|op.*vien.*tru/i.test(ndN);

  console.log({
    totalMatched: r.totalMatched,
    topScore: top.score,
    topSourceRow: top.sourceRowNumber,
    topDonVi: top.donVi,
    topNoiDungHead: (top.noiDungCongViec ?? "").slice(0, 100),
    topLooksAuxiliary: aux,
    topLooksMainFinishing: mainLike,
  });

  if (process.env.DEBUG_BOQ_SCORING === "1" && top.scoreDebug) {
    // eslint-disable-next-line no-console
    console.error("[scoreDebug top]", JSON.stringify(top.scoreDebug, null, 2));
  }

  if (aux && !/\b(gia\s*cong|cat\s+vien|van\s*chuyen)\b/i.test(QUERY)) {
    console.error("FAIL: top result is auxiliary-like but query has no auxiliary intent.");
    process.exit(1);
  }

  const idxMain = r.results.findIndex((x) => {
    const h = (x.normalizedPrimarySearchText ?? normalizeBaseSearchString(x.noiDungCongViec ?? ""))
      .toLowerCase()
      .trim();
    return (
      /op.*chan.*tuong|chan.*tuong.*vien|vien.*tru.*cot.*gach/i.test(h) &&
      String(x.donVi ?? "")
        .toLowerCase()
        .includes("m2")
    );
  });
  const idxAux = r.results.findIndex((x) =>
    /\bgia\s*cong\b/i.test(normalizeBaseSearchString(x.noiDungCongViec ?? ""))
  );
  if (idxMain >= 0 && idxAux >= 0 && idxAux < idxMain) {
    console.error("FAIL: auxiliary row ranks above main ốp chân tường (m2) line.", {
      idxMain,
      idxAux,
    });
    process.exit(1);
  }

  if (!mainLike && r.totalMatched > 1) {
    console.error("WARN: top result may not be the main ốp chân tường line — check data / retrieval.");
  }
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
