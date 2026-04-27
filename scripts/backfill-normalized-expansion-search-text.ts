/**
 * Backfill `normalizedExpansionSearchText` (alias layer for existing imports).
 * Run: npx tsx scripts/backfill-normalized-expansion-search-text.ts
 */
import { buildNormalizedExpansionSearchText } from "../lib/import/primary-search-text";
import { prisma } from "../lib/db/prisma";

const BATCH = 100;

async function main() {
  let total = 0;
  let lastId = "";

  for (;;) {
    const rows = await prisma.boqItem.findMany({
      where: {
        normalizedExpansionSearchText: "",
        ...(lastId ? { id: { gt: lastId } } : {}),
      },
      orderBy: { id: "asc" },
      take: BATCH,
      select: {
        id: true,
        nhomCongTac: true,
        noiDungCongViec: true,
        quyCachKyThuat: true,
      },
    });

    if (rows.length === 0) {
      break;
    }

    for (const r of rows) {
      await prisma.boqItem.update({
        where: { id: r.id },
        data: {
          normalizedExpansionSearchText: buildNormalizedExpansionSearchText(r),
        },
      });
    }

    total += rows.length;
    lastId = rows[rows.length - 1]!.id;
    console.log(`Updated ${rows.length} (running total ${total}), last id ${lastId}`);
  }

  console.log(`Done. Total rows updated: ${total}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
