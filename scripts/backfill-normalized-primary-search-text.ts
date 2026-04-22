/**
 * Backfill `normalizedPrimarySearchText` for rows where it is still empty (legacy imports).
 * Same build + normalize as import: `lib/import/primary-search-text.ts`.
 *
 * Updates are **one row per commit** (no large `$transaction`) so Prisma’s default
 * interactive transaction timeout (~5s) cannot fire. Safe to rerun: only rows with
 * `normalizedPrimarySearchText === ''` are selected.
 *
 * Run: npx tsx scripts/backfill-normalized-primary-search-text.ts
 */
import { prisma } from "../lib/db/prisma";
import { buildNormalizedPrimarySearchText } from "../lib/import/primary-search-text";

/** Page size for cursor scan only; each row is updated in its own short transaction. */
const BATCH = 100;

async function main() {
  let total = 0;
  let lastId = "";

  for (;;) {
    const rows = await prisma.boqItem.findMany({
      where: {
        normalizedPrimarySearchText: "",
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
          normalizedPrimarySearchText: buildNormalizedPrimarySearchText(r),
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
