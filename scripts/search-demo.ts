/**
 * Phase-1 search demo: runs a few Vietnamese BOQ-style queries via searchItems.
 * Run: npx tsx scripts/search-demo.ts
 */
import { prisma } from "../lib/db/prisma";
import { searchItems } from "../lib/search/search-service";

type Run = { query: string; selectedPricePeriodCode?: string };

const RUNS: Run[] = [
  { query: "vệ sinh cống" },
  { query: "phát cỏ" },
  { query: "đào đất" },
  { query: "bơm nước" },
  { query: "phá dỡ", selectedPricePeriodCode: "Q2_2026" },
];

async function main() {
  for (const run of RUNS) {
    const results = await searchItems(run.query, run.selectedPricePeriodCode);

    console.log(
      JSON.stringify(
        {
          query: run.query,
          ...(run.selectedPricePeriodCode != null
            ? { selectedPricePeriodCode: run.selectedPricePeriodCode }
            : {}),
          hitCount: results.length,
          results,
        },
        null,
        2
      )
    );
    console.log("---");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
