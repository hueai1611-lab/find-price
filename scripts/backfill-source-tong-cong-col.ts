/**
 * Backfill `boq_item_prices.sourceTongCongCol` for rows where it is NULL but the price
 * row already has `tongCong` (and period). On a given quarter master import, the
 * tongCong column index is identical for every item row for that period.
 *
 * Phase 1 — sibling copy (no workbook):
 * - For each (`importBatchId`, `pricePeriodCode`) group, take MIN(`sourceTongCongCol`)
 *   among rows where it IS NOT NULL.
 * - Apply that value to every row in the same group where `sourceTongCongCol` IS NULL
 *   AND `tongCong` IS NOT NULL, **only if** MIN = MAX within the group (no conflict).
 * - Groups with no non-null sibling are skipped (nothing to copy).
 * - Groups where MIN ≠ MAX are skipped entirely (logged); manual fix if ever needed.
 *
 * Phase 2 — workbook column (optional, when **all** siblings are still NULL):
 * - Set env `SOURCE_TONG_CONG_BACKFILL_WORKBOOK` to an absolute or repo-relative path
 *   to the same quarter `.xlsx` used for import (e.g. `data/Q2_2026.xlsx`).
 * - Reads the first sheet, `buildHeaderMap` on rows 1–3, derives `pricePeriodCode` from
 *   the file stem (same rule as `scripts/import-demo.ts`), and takes `tongCong` column
 *   as `matchedQuarter.columns.tongCong + 1` (1-based Excel column).
 * - Updates all `boq_item_prices` rows (NULL `sourceTongCongCol`, non-null `tongCong`)
 *   whose item’s `import_batches.fileName` equals the workbook **basename** and whose
 *   `pricePeriodCode` equals that stem.
 *
 * Idempotent: rerunning only touches rows still NULL that receive a resolved `col`.
 *
 * Run:
 *   npx tsx scripts/backfill-source-tong-cong-col.ts
 *   SOURCE_TONG_CONG_BACKFILL_WORKBOOK=data/Q2_2026.xlsx npx tsx scripts/backfill-source-tong-cong-col.ts
 */
import * as fs from "fs";
import * as path from "path";

import * as XLSX from "xlsx";

import { buildHeaderMap } from "../lib/import/header-map";
import { prisma } from "../lib/db/prisma";

/** Same stem rule as `scripts/import-demo.ts`. */
const PRICE_PERIOD_CODE_PATTERN = /^Q[1-4](?:_Q[1-4])?_\d{4}$/;

type ConflictRow = {
  importBatchId: string;
  pricePeriodCode: string;
  colMin: number;
  colMax: number;
};

function resolvePricePeriodCodeFromWorkbookPath(filePath: string): string {
  const stem = path.basename(filePath, path.extname(filePath));
  if (!PRICE_PERIOD_CODE_PATTERN.test(stem)) {
    throw new Error(
      `Workbook stem "${stem}" must match quarter code pattern (e.g. Q2_2026.xlsx).`,
    );
  }
  return stem;
}

async function backfillFromWorkbookIfConfigured(): Promise<number> {
  const raw = process.env.SOURCE_TONG_CONG_BACKFILL_WORKBOOK?.trim();
  if (!raw) return 0;

  const workbookPath = path.isAbsolute(raw)
    ? raw
    : path.join(process.cwd(), raw);
  if (!fs.existsSync(workbookPath)) {
    throw new Error(`SOURCE_TONG_CONG_BACKFILL_WORKBOOK not found: ${workbookPath}`);
  }

  const workbook = XLSX.readFile(workbookPath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Workbook has no sheets.");
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];
  const headerMap = buildHeaderMap(rows.slice(0, 3));
  const pricePeriodCode = resolvePricePeriodCodeFromWorkbookPath(workbookPath);
  const matchedQuarter = headerMap.quarterGroups.find(
    (g) => g.pricePeriodCode === pricePeriodCode,
  );
  if (!matchedQuarter) {
    throw new Error(
      `No quarter group in header map for ${pricePeriodCode}. Detected: ${headerMap.quarterGroups.map((g) => g.pricePeriodCode).join(", ") || "none"}`,
    );
  }
  const zeroBased = matchedQuarter.columns.tongCong;
  if (zeroBased === undefined) {
    throw new Error(`Header map has no tongCong column for period ${pricePeriodCode}.`);
  }
  const sourceTongCongCol = zeroBased + 1;
  const fileName = path.basename(workbookPath);

  const updated = await prisma.$executeRaw`
    UPDATE "boq_item_prices" AS p
    SET
      "sourceTongCongCol" = ${sourceTongCongCol},
      "updatedAt" = CURRENT_TIMESTAMP
    FROM "boq_items" AS bi
    INNER JOIN "import_batches" AS ib ON ib.id = bi."importBatchId"
    WHERE p."boqItemId" = bi.id
      AND ib."fileName" = ${fileName}
      AND p."pricePeriodCode" = ${pricePeriodCode}
      AND p."sourceTongCongCol" IS NULL
      AND p."tongCong" IS NOT NULL
  `;

  return Number(updated);
}

async function main() {
  const conflicts = await prisma.$queryRaw<ConflictRow[]>`
    SELECT
      bi."importBatchId" AS "importBatchId",
      p."pricePeriodCode" AS "pricePeriodCode",
      MIN(p."sourceTongCongCol")::int AS "colMin",
      MAX(p."sourceTongCongCol")::int AS "colMax"
    FROM "boq_item_prices" p
    INNER JOIN "boq_items" bi ON bi.id = p."boqItemId"
    WHERE p."sourceTongCongCol" IS NOT NULL
    GROUP BY bi."importBatchId", p."pricePeriodCode"
    HAVING MIN(p."sourceTongCongCol") <> MAX(p."sourceTongCongCol")
  `;

  if (conflicts.length > 0) {
    console.warn(
      `[backfill-source-tong-cong-col] Skipping ${conflicts.length} (importBatchId, pricePeriodCode) group(s) with inconsistent sourceTongCongCol among siblings:`,
    );
    for (const c of conflicts.slice(0, 20)) {
      console.warn(
        `  batch=${c.importBatchId} period=${c.pricePeriodCode} min=${c.colMin} max=${c.colMax}`,
      );
    }
    if (conflicts.length > 20) {
      console.warn(`  ... and ${conflicts.length - 20} more`);
    }
  }

  const updatedSiblings = await prisma.$executeRaw`
    UPDATE "boq_item_prices" AS p
    SET
      "sourceTongCongCol" = src.col,
      "updatedAt" = CURRENT_TIMESTAMP
    FROM "boq_items" AS bi
    INNER JOIN (
      SELECT
        bi2."importBatchId" AS "importBatchId",
        p2."pricePeriodCode" AS "pricePeriodCode",
        MIN(p2."sourceTongCongCol")::int AS col
      FROM "boq_item_prices" AS p2
      INNER JOIN "boq_items" AS bi2 ON bi2.id = p2."boqItemId"
      WHERE p2."sourceTongCongCol" IS NOT NULL
      GROUP BY bi2."importBatchId", p2."pricePeriodCode"
      HAVING MIN(p2."sourceTongCongCol") = MAX(p2."sourceTongCongCol")
    ) AS src ON src."importBatchId" = bi."importBatchId"
    WHERE p."boqItemId" = bi.id
      AND p."pricePeriodCode" = src."pricePeriodCode"
      AND p."sourceTongCongCol" IS NULL
      AND p."tongCong" IS NOT NULL
      AND src.col IS NOT NULL
  `;

  let updatedWorkbook = 0;
  try {
    updatedWorkbook = await backfillFromWorkbookIfConfigured();
  } catch (e) {
    if (process.env.SOURCE_TONG_CONG_BACKFILL_WORKBOOK?.trim()) {
      throw e;
    }
  }

  const remaining = await prisma.$queryRaw<[{ n: bigint }]>`
    SELECT COUNT(*)::bigint AS n
    FROM "boq_item_prices" p
    WHERE p."sourceTongCongCol" IS NULL
      AND p."tongCong" IS NOT NULL
  `;

  console.log(
    JSON.stringify(
      {
        rowsUpdatedFromSiblings: Number(updatedSiblings),
        rowsUpdatedFromWorkbook: updatedWorkbook,
        conflictGroupsSkipped: conflicts.length,
        remainingNullWithTongCong: Number(remaining[0]?.n ?? 0),
      },
      null,
      2,
    ),
  );

  if (Number(updatedSiblings) === 0 && remaining[0] && Number(remaining[0].n) > 0 && !process.env.SOURCE_TONG_CONG_BACKFILL_WORKBOOK?.trim()) {
    console.log(
      "[backfill-source-tong-cong-col] No sibling anchors found (all sourceTongCongCol NULL in DB). " +
        "Set SOURCE_TONG_CONG_BACKFILL_WORKBOOK=data/Q2_2026.xlsx (same file as import) to run phase 2.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
