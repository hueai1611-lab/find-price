/**
 * Phase-1 search demo: runs a few Vietnamese BOQ-style queries via searchItems.
 * Run: npx tsx scripts/search-demo.ts
 */
import { prisma } from "../lib/db/prisma";
import { searchItems } from "../lib/search/search-service";

type Run = { query: string; selectedPricePeriodCode?: string };

const RUNS: Run[] = [
  // { query: "vệ sinh cống" },
  // { query: "phát cỏ" },
  // { query: "đào đất" },
  // { query: "bơm nước" },
  // { query: "phá dỡ", selectedPricePeriodCode: "Q2_2026" },
  // { query: "phá dỡ gốc cây <=20cm", selectedPricePeriodCode: "Q2_2026" },
  // { query: "phá dỡ gốc cây 21 cm", selectedPricePeriodCode: "Q2_2026" },
  // { query: "khoan cấy thép D10", selectedPricePeriodCode: "Q2_2026" },
  { query: "Chặt cây ở địa hình bằng phẳng bằng máy cưa", selectedPricePeriodCode: "Q2_2026" },
  // { query: "Phát quang và chặt cây bụi", selectedPricePeriodCode: "Q2_2026" },
  
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
