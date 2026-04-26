import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

import { prisma } from "@/lib/db/prisma";
import { buildExternalCellLinkFormula, parseLinkExcelTarget } from "@/lib/excel/external-link-formula";
import { resolveQuarterMasterRootPath } from "@/lib/settings/app-settings";
import { searchItems } from "@/lib/search/search-service";
import type { SearchResult } from "@/lib/search/search-types";

/** Ranked results considered when picking "first with tongCong" (daily-file only). */
const DAILY_FILE_LINK_SEARCH_MAX_RESULTS = 25;

const RESULT_SHEET_NAME = "Kết quả";

const RESULT_HEADERS = [
  "STT",
  "Daily sheet",
  "Daily row",
  "Query",
  "Matched summary",
  "Giá Tổng",
  "Linked formula",
  "Status",
] as const;

/** 1-based column indexes on result sheet */
const COL_GIA_TONG = 6;
const COL_LINKED_FORMULA = 7;

/** Header highlight for Giá Tổng + Linked formula (light amber). */
const FILL_HEADER_HIGHLIGHT: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF4CC" },
};

/** Very light tint on data cells in those two columns. */
const FILL_DATA_HIGHLIGHT: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFBF0" },
};

function toInt(value: FormDataEntryValue | null, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeExcelColLetters(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v.trim() : "";
  const cleaned = s.replace(/[^A-Za-z]/g, "").toUpperCase();
  return cleaned;
}

function colLettersToNumber(col: string): number | null {
  const s = col.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(s)) return null;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n >= 1 ? n : null;
}

function hasDisplayableTongCong(r: { tongCong?: string | null }): boolean {
  return typeof r.tongCong === "string" && r.tongCong.trim().length > 0;
}

function pickBestResult(results: SearchResult[]): SearchResult | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  return results.find(hasDisplayableTongCong) ?? results[0] ?? null;
}

/** Plain text from an ExcelJS cell on the uploaded daily workbook (read-only). */
function cellQueryString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null || v === "") return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "richText" in v) {
    const rt = (v as ExcelJS.CellRichTextValue).richText;
    if (Array.isArray(rt)) {
      return rt.map((t) => t.text).join("").trim();
    }
  }
  if (typeof v === "object" && v !== null && "formula" in v) {
    const fv = v as ExcelJS.CellFormulaValue;
    const r = fv.result;
    if (typeof r === "string") return r.trim();
    if (typeof r === "number" || typeof r === "boolean") return String(r).trim();
  }
  const t = cell.text?.trim();
  if (t) return t;
  return String(v).trim();
}

function tongCongToFormulaCachedResult(raw: string | null | undefined): number | undefined {
  if (raw == null) return undefined;
  let s = raw.trim().replace(/\s/g, "").replace(/\u00a0/g, "");
  if (!s) return undefined;
  if (s.includes(",") && s.includes(".")) {
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function matchedSummaryText(best: SearchResult): string {
  const hop = best.noiDungTongHop?.trim();
  if (hop) return hop;
  const parts = [best.nhomCongTac?.trim(), best.noiDungCongViec?.trim()].filter(Boolean);
  return parts.join(" — ");
}

export async function POST(request: Request) {
  const form = await request.formData();

  const file = form.get("file");
  const sheetName = typeof form.get("sheetName") === "string" ? String(form.get("sheetName")).trim() : "";
  const inputColLetters = normalizeExcelColLetters(form.get("inputCol"));
  const startRow = toInt(form.get("startRow"), 2);
  const pricePeriodCode =
    typeof form.get("pricePeriodCode") === "string" && String(form.get("pricePeriodCode")).trim() !== ""
      ? String(form.get("pricePeriodCode")).trim()
      : "";
  const linkTarget = parseLinkExcelTarget(form.get("linkTarget"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!sheetName) {
    return NextResponse.json({ error: "sheetName is required" }, { status: 400 });
  }
  if (!inputColLetters) {
    return NextResponse.json({ error: "inputCol is required (e.g. A)" }, { status: 400 });
  }
  if (!pricePeriodCode) {
    return NextResponse.json({ error: "pricePeriodCode is required" }, { status: 400 });
  }
  if (!Number.isFinite(startRow) || startRow < 1 || startRow > 1_000_000) {
    return NextResponse.json({ error: "startRow must be a positive integer" }, { status: 400 });
  }
  if (!colLettersToNumber(inputColLetters)) {
    return NextResponse.json({ error: "inputCol must be Excel letters (A, B, AA...)" }, { status: 400 });
  }

  const ab = await file.arrayBuffer();
  const inputWb = new ExcelJS.Workbook();
  await inputWb.xlsx.load(new Uint8Array(ab) as never);

  const inputSheet =
    inputWb.getWorksheet(sheetName) ?? inputWb.worksheets.find((w) => w.name === sheetName) ?? null;
  if (!inputSheet) {
    return NextResponse.json({ error: `sheet not found: ${sheetName}` }, { status: 400 });
  }

  const rootPath = await resolveQuarterMasterRootPath();
  const importBatchFileNameCache = new Map<string, string>();
  const sourceTongCongColCache = new Map<string, number | null>();

  const lastDataRow = inputSheet.lastRow?.number ?? startRow;
  const cappedLastRow = Math.min(Math.max(lastDataRow, startRow), 20000);

  const outWb = new ExcelJS.Workbook();
  outWb.creator = "find-price";
  const outWs = outWb.addWorksheet(RESULT_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  outWs.addRow([...RESULT_HEADERS]);
  const headerRow = outWs.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.getCell(COL_GIA_TONG).fill = { ...FILL_HEADER_HIGHLIGHT };
  headerRow.getCell(COL_LINKED_FORMULA).fill = { ...FILL_HEADER_HIGHLIGHT };

  let rowsProcessed = 0;
  let rowsLinked = 0;
  let rowsNotLinked = 0;

  let stt = 0;
  for (let r = startRow; r <= cappedLastRow; r++) {
    rowsProcessed++;
    stt++;
    const inputAddr = `${inputColLetters}${r}`;
    const query = cellQueryString(inputSheet.getCell(inputAddr));

    if (!query) {
      rowsNotLinked++;
      outWs.addRow([stt, sheetName, r, "", "", "", "", "EMPTY_QUERY"]);
      continue;
    }

    const { results } = await searchItems(query, pricePeriodCode, {
      maxResults: DAILY_FILE_LINK_SEARCH_MAX_RESULTS,
    });
    const best = pickBestResult(results);

    if (!best) {
      rowsNotLinked++;
      outWs.addRow([stt, sheetName, r, query, "", "", "", "NO_MATCH"]);
      continue;
    }

    const summary = matchedSummaryText(best);
    const giaTongNum = tongCongToFormulaCachedResult(best.tongCong);

    let masterWorkbookFileName = "";
    if (best.importBatchId) {
      let cached = importBatchFileNameCache.get(best.importBatchId);
      if (cached === undefined) {
        const batch = await prisma.importBatch.findUnique({
          where: { id: best.importBatchId },
          select: { fileName: true },
        });
        cached = batch?.fileName ?? "";
        importBatchFileNameCache.set(best.importBatchId, cached);
      }
      masterWorkbookFileName = cached;
    }

    const sourceRowNumber = best.sourceRowNumber;
    const colKey = `${best.itemId}|${pricePeriodCode}`;
    let sourceTongCongCol = sourceTongCongColCache.get(colKey);
    if (sourceTongCongCol === undefined) {
      const price = await prisma.boqItemPrice.findFirst({
        where: { boqItemId: best.itemId, pricePeriodCode },
        select: { sourceTongCongCol: true },
      });
      sourceTongCongCol = price?.sourceTongCongCol ?? null;
      sourceTongCongColCache.set(colKey, sourceTongCongCol);
    }

    const canLink =
      Boolean(best.importBatchId) &&
      Boolean(masterWorkbookFileName) &&
      Boolean(sourceRowNumber && sourceRowNumber >= 1) &&
      Boolean(sourceTongCongCol && sourceTongCongCol >= 1) &&
      Boolean(best.sheetName?.trim());

    if (!canLink) {
      rowsNotLinked++;
      const row = outWs.addRow([
        stt,
        sheetName,
        r,
        query,
        summary,
        giaTongNum ?? "",
        "",
        "NO_LINK",
      ]);
      row.getCell(COL_LINKED_FORMULA).value = null;
      continue;
    }

    const formulaWithEquals = buildExternalCellLinkFormula({
      rootPath,
      linkTarget,
      workbookFileName: masterWorkbookFileName,
      sheetName: best.sheetName as string,
      rowNumber: sourceRowNumber as number,
      colNumber: sourceTongCongCol as number,
    });
    const f = formulaWithEquals.startsWith("=") ? formulaWithEquals.slice(1) : formulaWithEquals;
    const cachedResult = tongCongToFormulaCachedResult(best.tongCong);

    rowsLinked++;
    const row = outWs.addRow([
      stt,
      sheetName,
      r,
      query,
      summary,
      giaTongNum ?? "",
      "",
      "LINKED",
    ]);

    const linkCell = row.getCell(COL_LINKED_FORMULA);
    linkCell.value =
      cachedResult !== undefined ? { formula: f, result: cachedResult } : { formula: f };
  }

  const lastOutRow = outWs.lastRow?.number ?? 1;
  for (let rn = 2; rn <= lastOutRow; rn++) {
    const row = outWs.getRow(rn);
    row.getCell(COL_GIA_TONG).fill = { ...FILL_DATA_HIGHLIGHT };
    row.getCell(COL_LINKED_FORMULA).fill = { ...FILL_DATA_HIGHLIGHT };
  }

  outWs.columns = [
    { width: 5 },
    { width: 18 },
    { width: 6 },
    { width: 36 },
    { width: 52 },
    { width: 14 },
    { width: 48 },
    { width: 12 },
  ];

  const out = await outWb.xlsx.writeBuffer();
  const outName = `daily-search-results-${pricePeriodCode}.xlsx`;
  return new NextResponse(new Uint8Array(out as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${outName}"`,
      "X-Rows-Processed": String(rowsProcessed),
      "X-Rows-Linked": String(rowsLinked),
      "X-Rows-Blank": String(rowsNotLinked),
    },
  });
}
