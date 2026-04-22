/**
 * Demo import (phase 1)
 *
 * Goals:
 * - Create one ImportBatch
 * - Read the first sheet
 * - Use 3 header rows
 * - Parse base BOQ item fields
 * - Workbook under `data/<QUARTER>.xlsx` (basename stem = pricePeriodCode, e.g. Q2_2026)
 * - Parse price cells for that quarter only (other quarter blocks in the sheet are ignored)
 * - Persist up to N valid item rows (scan past section/subgroup rows until quota)
 *
 * Phase 1 rules:
 * 1) Only persist rows where rowType === "item"
 * 2) Require at least one substantive field among:
 *    - noiDungCongViec
 *    - quyCachKyThuat
 *    (exclude short legend tokens like "2", "6a", "1c")
 * 3) Convert numeric strings for vatTu / thiCong / tongCong
 * 4) Keep raw imported values in raw* fields
 * 5) Log row-level failures, do not abort the whole batch
 */

import * as fs from "fs";
import * as XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db/prisma";
import { buildHeaderMap } from "../lib/import/header-map";
import {
  buildNormalizedPrimarySearchText,
  buildSearchText,
  normalizeSearchText,
} from "../lib/import/primary-search-text";
import { parseBaseItem } from "../lib/import/parse-base-item";
import { parseSingleQuarterPriceForPeriod } from "../lib/import/parse-quarter-prices";

/**
 * Stop after this many BoqItem rows persisted (valid items only, not raw sheet rows).
 * Keep high enough that later sheet sections (e.g. khoan cấy thép, phụ kiện D10) are indexed.
 */
const DEMO_VALID_ITEM_LIMIT = 5000;

/**
 * Toggle focused debug output.
 * Keep false by default once import is stable.
 */
const DEBUG_IMPORT = false;

/** Must match codes produced by `lib/import/header-map` (e.g. Q2_2026, Q2_Q3_2026). */
const PRICE_PERIOD_CODE_PATTERN = /^Q[1-4](?:_Q[1-4])?_\d{4}$/;

const DATA_DIR = "data";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Plain `.xlsx` name only; file is read from `data/<name>`. */
function resolveImportWorkbookPath(): string {
  const base = (process.env.IMPORT_XLSX_BASENAME ?? "Q2_2026.xlsx").trim();
  if (!base || base.includes("..") || base.includes("/") || base.includes("\\")) {
    console.error(
      "IMPORT_XLSX_BASENAME must be a plain file name (no paths), e.g. Q2_2026.xlsx"
    );
    process.exit(1);
  }
  if (!base.toLowerCase().endsWith(".xlsx")) {
    console.error("IMPORT_XLSX_BASENAME must end with .xlsx");
    process.exit(1);
  }
  return path.join(repoRoot, DATA_DIR, base);
}

/**
 * Quarter for this run = stem of workbook basename (e.g. data/Q2_2026.xlsx → Q2_2026).
 * Optional `PRICE_PERIOD_CODE` must match the stem or import aborts.
 */
function resolvePricePeriodCodeFromWorkbookPath(filePath: string): string {
  const stem = path.basename(filePath, path.extname(filePath));
  if (!PRICE_PERIOD_CODE_PATTERN.test(stem)) {
    console.error(
      `Workbook name stem "${stem}" must match quarter code pattern (rename to e.g. Q2_2026.xlsx).`
    );
    process.exit(1);
  }
  const override = process.env.PRICE_PERIOD_CODE?.trim();
  if (override && override !== stem) {
    console.error(
      `PRICE_PERIOD_CODE=${override} does not match file quarter ${stem} (remove override or rename file).`
    );
    process.exit(1);
  }
  return stem;
}

function toDecimalOrNull(value?: string | null): string | null {
  if (!value) return null;

  const cleaned = value
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .trim();

  if (!cleaned) return null;

  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return null;

  return parsed.toFixed(2);
}

/** Legend / numbering cells (column markers), not real work descriptions. */
function isLegendNumberingText(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 4) return false;
  return /^[0-9]{1,3}[a-z]?$/i.test(t);
}

function hasMeaningfulItemContent(base: {
  noiDungCongViec?: string | null;
  quyCachKyThuat?: string | null;
}): boolean {
  const n = (base.noiDungCongViec ?? "").trim();
  const q = (base.quyCachKyThuat ?? "").trim();
  if (!n && !q) return false;
  const substantive = (s: string) => s.length > 0 && !isLegendNumberingText(s);
  return substantive(n) || substantive(q);
}

function hasAnyQuarterValue(price: {
  vatTu?: string | null;
  thiCong?: string | null;
  tongCong?: string | null;
  linkHdThamKhao?: string | null;
  ghiChu?: string | null;
}): boolean {
  return Boolean(
    price.vatTu ||
      price.thiCong ||
      price.tongCong ||
      price.linkHdThamKhao ||
      price.ghiChu
  );
}

async function main() {
  const filePath = resolveImportWorkbookPath();

  if (!fs.existsSync(filePath)) {
    console.error(`Workbook not found: ${filePath}`);
    console.error(
      `Place the file under ${path.join(repoRoot, DATA_DIR)}/ or set IMPORT_XLSX_BASENAME.`
    );
    process.exit(1);
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];

  const headerRows = rows.slice(0, 3);
  const dataRows = rows.slice(3);

  const headerMap = buildHeaderMap(headerRows);

  const pricePeriodCode = resolvePricePeriodCodeFromWorkbookPath(filePath);
  const matchedQuarter = headerMap.quarterGroups.find(
    (g) => g.pricePeriodCode === pricePeriodCode
  );
  if (!matchedQuarter) {
    const detected = headerMap.quarterGroups
      .map((g) => g.pricePeriodCode)
      .join(", ");
    console.error(
      `No header column block matches file quarter ${pricePeriodCode}. Detected groups: [${detected || "none"}].`
    );
    process.exit(1);
  }
  const pricePeriodLabel =
    process.env.PRICE_PERIOD_LABEL?.trim() || matchedQuarter.pricePeriodLabel;

  if (DEBUG_IMPORT) {
    console.log(
      "quarterGroups detail:",
      JSON.stringify(headerMap.quarterGroups, null, 2)
    );

    console.log(
      "Header map summary:",
      JSON.stringify(
        {
          baseColumnCount: Object.keys(headerMap.baseColumns).length,
          quarterGroupCount: headerMap.quarterGroups.length,
        },
        null,
        2
      )
    );
  }

  const importBatch = await prisma.importBatch.create({
    data: {
      fileName: path.basename(filePath),
      versionLabel: "01.04.2026",
      pricePeriodCode,
      pricePeriodLabel,
      status: "processing",
      sheetNames: [sheetName],
      headerRowRange: "1-3",
      totalRowsDetected: rows.length,
      startedAt: new Date(),
    },
  });

  let importedItems = 0;
  let importedPrices = 0;
  let rowsFailed = 0;
  const errorLines: string[] = [];

  let loggedSamplePriceCells = false;
  let loggedSampleParsedPrices = false;
  let lastDataRowIndexScanned = -1;

  for (let i = 0; i < dataRows.length; i++) {
    if (importedItems >= DEMO_VALID_ITEM_LIMIT) break;

    const row = dataRows[i];
    const sourceRowNumber = i + 4;
    lastDataRowIndexScanned = i;

    try {
      const base = parseBaseItem(row, headerMap);

      if (base.rowType !== "item") continue;
      if (!hasMeaningfulItemContent(base)) continue;

      if (DEBUG_IMPORT && !loggedSamplePriceCells) {
        console.log(
          "SAMPLE PRICE CELLS",
          sourceRowNumber,
          row.slice(9, 29).map((value, offset) => [offset + 9, value])
        );
        loggedSamplePriceCells = true;
      }

      const normalizedPrimarySearchText = buildNormalizedPrimarySearchText(base);

      const searchText = buildSearchText([
        base.nhomCongTac,
        base.noiDungCongViec,
        base.quyCachKyThuat,
        base.yeuCauKhac,
        base.donVi,
        base.maHieuHsmt,
        base.maHieuKsg,
      ]);

      const normalizedSearchText = normalizeSearchText(searchText);

      const item = await prisma.boqItem.create({
        data: {
          importBatchId: importBatch.id,
          sourceFileName: path.basename(filePath),
          sheetName,
          sourceRowNumber,
          versionLabel: "01.04.2026",

          stt: base.stt,
          ctxd: base.ctxd,
          maHieuHsmt: base.maHieuHsmt,
          maHieuKsg: base.maHieuKsg,
          nhomCongTac: base.nhomCongTac,
          noiDungCongViec: base.noiDungCongViec,
          quyCachKyThuat: base.quyCachKyThuat,
          yeuCauKhac: base.yeuCauKhac,
          donVi: base.donVi,
          nguoiThucHien: base.nguoiThucHien,

          rowType: base.rowType,
          sectionCode: base.sectionCode,
          subgroupCode: base.subgroupCode,
          isSearchable: true,

          rawStt: base.stt,
          rawCtxd: base.ctxd,
          rawMaHieuHsmt: base.maHieuHsmt,
          rawMaHieuKsg: base.maHieuKsg,
          rawNhomCongTac: base.nhomCongTac,
          rawNoiDungCongViec: base.noiDungCongViec,
          rawQuyCachKyThuat: base.quyCachKyThuat,
          rawYeuCauKhac: base.yeuCauKhac,
          rawDonVi: base.donVi,
          rawNguoiThucHien: base.nguoiThucHien,
          rawRowJson: base.rawRowJson as Prisma.InputJsonValue,

          normalizedNhomCongTac: base.nhomCongTac?.toLowerCase() ?? null,
          normalizedNoiDungCongViec:
            base.noiDungCongViec?.toLowerCase() ?? null,
          normalizedQuyCachKyThuat:
            base.quyCachKyThuat?.toLowerCase() ?? null,
          normalizedYeuCauKhac: base.yeuCauKhac?.toLowerCase() ?? null,
          normalizedDonVi: base.donVi?.toLowerCase() ?? null,
          normalizedMaHieuHsmt: base.maHieuHsmt?.toLowerCase() ?? null,
          normalizedMaHieuKsg: base.maHieuKsg?.toLowerCase() ?? null,

          searchText,
          normalizedSearchText,
          normalizedPrimarySearchText,
        },
      });

      importedItems++;

      const p = parseSingleQuarterPriceForPeriod(row, headerMap, pricePeriodCode);

      if (DEBUG_IMPORT && !loggedSampleParsedPrices && p) {
        console.log(
          "SAMPLE PARSED PRICE (single quarter)",
          sourceRowNumber,
          JSON.stringify(p, null, 2)
        );
        loggedSampleParsedPrices = true;
      }

      if (p && hasAnyQuarterValue(p)) {
        await prisma.boqItemPrice.create({
          data: {
            boqItemId: item.id,
            pricePeriodCode,
            pricePeriodLabel,

            vatTu: toDecimalOrNull(p.vatTu) ?? undefined,
            thiCong: toDecimalOrNull(p.thiCong) ?? undefined,
            tongCong: toDecimalOrNull(p.tongCong) ?? undefined,
            linkHdThamKhao: p.linkHdThamKhao ?? null,
            ghiChu: p.ghiChu ?? null,

            rawVatTu: p.vatTu ?? null,
            rawThiCong: p.thiCong ?? null,
            rawTongCong: p.tongCong ?? null,
            rawLinkHdThamKhao: p.linkHdThamKhao ?? null,
            rawGhiChu: p.ghiChu ?? null,
          },
        });

        importedPrices++;
      }
    } catch (error) {
      rowsFailed++;
      const message =
        error instanceof Error ? error.message : "Unknown import error";

      errorLines.push(`row ${sourceRowNumber}: ${message}`);
      console.error(`Import row failed at source row ${sourceRowNumber}`, error);

      try {
        await prisma.importRowError.create({
          data: {
            importBatchId: importBatch.id,
            sheetName,
            sourceRowNumber,
            errorCode: "ROW_IMPORT_FAILED",
            errorMessage: message,
            rawRowJson: JSON.parse(
              JSON.stringify(row)
            ) as Prisma.InputJsonValue,
          },
        });
      } catch (logError) {
        console.error("Failed to persist ImportRowError", logError);
      }
    }
  }

  await prisma.importBatch.update({
    where: { id: importBatch.id },
    data: {
      status: rowsFailed > 0 ? "completed_with_errors" : "completed",
      totalRowsImported: importedItems,
      totalRowsFailed: rowsFailed,
      totalItemsCreated: importedItems,
      totalItemPricesCreated: importedPrices,
      errorSummary: errorLines.length > 0 ? errorLines.join(" | ") : null,
      completedAt: new Date(),
    },
  });

  console.log({
    demoValidItemTarget: DEMO_VALID_ITEM_LIMIT,
    dataRowsScanned: lastDataRowIndexScanned + 1,
    dataRowsTotal: dataRows.length,
    importedItems,
    importedPrices,
    rowsFailed,
    importBatchId: importBatch.id,
  });
}

main()
  .catch(async (error) => {
    console.error("Import demo failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });