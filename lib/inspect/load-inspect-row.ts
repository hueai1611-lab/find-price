import * as fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

import type { WorkBook } from "xlsx";

import { prisma } from "@/lib/db/prisma";

import { verifyExcelRowMatchesItem } from "./row-sanity";
import { getSourceXlsxRoot } from "./source-xlsx-root";

const CONTEXT_ROWS = 6;

export type InspectRowPageData =
  | { ok: false; title: string; message: string }
  | {
      ok: true;
      resolvedPath: string;
      sourceXlsxRoot: string;
      batchFileName: string;
      sheetName: string;
      sourceRowNumber: number;
      highlightIndex: number;
      windowStart: number;
      windowRows: unknown[][];
      lineNumbers1Based: number[];
      sanity: ReturnType<typeof verifyExcelRowMatchesItem>;
      itemLabel: string;
    };

/** Only accept a plain workbook filename (no directories, no `..`). */
function safeBasename(fileName: string): string | null {
  const n = fileName.replace(/\\/g, "/").trim();
  if (!n || n.includes("..") || n.includes("/")) return null;
  const base = path.basename(n);
  return base || null;
}

/** Internal-tool debug text when `fs.existsSync(resolvedPath)` is false. */
function formatWorkbookNotFoundMessage(p: {
  resolvedPath: string;
  root: string;
  base: string;
  sourceEnvRaw: string | undefined;
}): string {
  const effectiveRoot = p.sourceEnvRaw
    ? `SOURCE_XLSX_ROOT set → effective root ${p.root}`
    : `SOURCE_XLSX_ROOT unset → default Excel root (project data/) = ${p.root}`;

  return [
    "Workbook file not found on disk (inspect preview).",
    `Resolved path: ${p.resolvedPath}.`,
    `${effectiveRoot}.`,
    `Batch / basename from DB: ${p.base}.`,
    "Fix: place that .xlsx at the resolved path, or set SOURCE_XLSX_ROOT to a directory that contains this basename.",
  ].join(" ");
}

function formatWorkbookReadError(p: {
  resolvedPath: string;
  root: string;
  base: string;
  sourceEnvRaw: string | undefined;
  cause: string;
}): string {
  const effectiveRoot = p.sourceEnvRaw
    ? `SOURCE_XLSX_ROOT set → effective root ${p.root}`
    : `SOURCE_XLSX_ROOT unset → default Excel root (project data/) = ${p.root}`;

  return [
    "Could not read workbook bytes (inspect preview).",
    `Resolved path: ${p.resolvedPath}.`,
    `${effectiveRoot}.`,
    `Batch / basename from DB: ${p.base}.`,
    `System/cause: ${p.cause}`,
    "If the path looks correct, check file permissions, disk access, or try opening the same path with fs outside Next.",
  ].join(" ");
}

export async function loadInspectRowPageData(
  itemId: string | undefined
): Promise<InspectRowPageData> {
  if (!itemId?.trim()) {
    return { ok: false, title: "Missing itemId", message: "Add ?itemId=… from search results." };
  }

  const item = await prisma.boqItem.findUnique({
    where: { id: itemId.trim() },
    include: { importBatch: true },
  });

  if (!item) {
    return { ok: false, title: "Not found", message: "No BOQ item for this itemId." };
  }

  if (item.sourceRowNumber == null || item.sourceRowNumber < 1) {
    return {
      ok: false,
      title: "No row number",
      message: "This item has no sourceRowNumber; cannot open sheet preview.",
    };
  }

  const batchName = item.importBatch.fileName?.trim();
  const itemFile = item.sourceFileName?.trim();
  if (batchName && itemFile && path.basename(batchName) !== path.basename(itemFile)) {
    return {
      ok: false,
      title: "File mismatch",
      message: `ImportBatch.fileName (${batchName}) does not match BoqItem.sourceFileName (${itemFile}).`,
    };
  }

  const base = safeBasename(batchName ?? itemFile ?? "");
  if (!base) {
    return { ok: false, title: "Invalid file name", message: "Could not resolve a safe workbook basename." };
  }

  const root = getSourceXlsxRoot();
  const resolvedPath = path.resolve(path.join(root, base));
  const sourceEnvRaw = process.env.SOURCE_XLSX_ROOT?.trim();

  if (!fs.existsSync(resolvedPath)) {
    return {
      ok: false,
      title: "Workbook not on disk",
      message: formatWorkbookNotFoundMessage({
        resolvedPath,
        root,
        base,
        sourceEnvRaw,
      }),
    };
  }

  let workbook: WorkBook;
  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      return {
        ok: false,
        title: "Workbook path is not a file",
        message: formatWorkbookReadError({
          resolvedPath,
          root,
          base,
          sourceEnvRaw,
          cause: "Path exists but is not a regular file (directory or special node).",
        }),
      };
    }
    const buf = fs.readFileSync(resolvedPath);
    workbook = XLSX.read(buf, { type: "buffer", cellDates: false });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      title: "Cannot read workbook",
      message: formatWorkbookReadError({
        resolvedPath,
        root,
        base,
        sourceEnvRaw,
        cause,
      }),
    };
  }

  const sheet = workbook.Sheets[item.sheetName];
  if (!sheet) {
    return {
      ok: false,
      title: "Sheet missing",
      message: `Workbook has no sheet named "${item.sheetName}".`,
    };
  }

  const allRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];

  const highlightIndex = item.sourceRowNumber - 1;
  if (highlightIndex < 0 || highlightIndex >= allRows.length) {
    return {
      ok: false,
      title: "Row out of range",
      message: `sourceRowNumber=${item.sourceRowNumber} is outside sheet row count (${allRows.length}).`,
    };
  }

  const targetRow = allRows[highlightIndex] ?? [];
  const sanity = verifyExcelRowMatchesItem(targetRow, {
    nhomCongTac: item.nhomCongTac,
    noiDungCongViec: item.noiDungCongViec,
    quyCachKyThuat: item.quyCachKyThuat,
  });

  const start = Math.max(0, highlightIndex - CONTEXT_ROWS);
  const end = Math.min(allRows.length - 1, highlightIndex + CONTEXT_ROWS);
  const windowRows = allRows.slice(start, end + 1);
  const lineNumbers1Based = windowRows.map((_, i) => start + i + 1);

  return {
    ok: true,
    resolvedPath,
    sourceXlsxRoot: root,
    batchFileName: base,
    sheetName: item.sheetName,
    sourceRowNumber: item.sourceRowNumber,
    highlightIndex: highlightIndex - start,
    windowStart: start,
    windowRows,
    lineNumbers1Based,
    sanity,
    itemLabel: [item.maHieuKsg, item.nhomCongTac].filter(Boolean).join(" · ") || item.id,
  };
}
