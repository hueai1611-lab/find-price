/**
 * Khai thác cụm từ / n-gram từ file BĐG (layout Vinhomes) và file dự toán dạng cột rộng
 * (ví dụ output/small-Book3.xlsx) để hỗ trợ bổ sung từ điển đồng nghĩa thủ công.
 *
 * Chạy:
 *   npx tsx scripts/mine-boq-phrases-from-xlsx.ts
 *   npx tsx scripts/mine-boq-phrases-from-xlsx.ts --out data/boq-mined-phrase-stats.json
 *
 * Mặc định đọc: data/Q2_2026.xlsx, output/small-Book3.xlsx
 */

import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { fileURLToPath } from "url";

import { buildHeaderMap } from "../lib/import/header-map";
import { parseBaseItem } from "../lib/import/parse-base-item";
import { buildNormalizedPrimarySearchText } from "../lib/import/primary-search-text";
import { normalizeBaseSearchString } from "../lib/search/boq-search-normalize";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_FILES = [
  path.join(repoRoot, "data", "Q2_2026.xlsx"),
  path.join(repoRoot, "output", "small-Book3.xlsx"),
];

type NgramStats = { bigrams: [string, number][]; trigrams: [string, number][] };

function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

function topCounts(m: Map<string, number>, min: number, limit: number): [string, number][] {
  return [...m.entries()]
    .filter(([, c]) => c >= min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function isBdgLayout(rows: unknown[][]): boolean {
  if (rows.length < 4) return false;
  try {
    const hm = buildHeaderMap(rows.slice(0, 3));
    return hm.quarterGroups.length > 0;
  } catch {
    return false;
  }
}

/** Dự toán kiểu Vingroup: cột B STT, C mô tả, D quy cách (range nhỏ để tránh parse hàng chục nghìn cột rỗng). */
function extractDuToanTextsFromSheet(sheet: XLSX.Sheet, maxDataRows: number): string[] {
  const range = `A1:J${maxDataRows + 20}`;
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    range,
  }) as unknown[][];
  const texts: string[] = [];
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const moTa = String(r[2] ?? "").trim();
    const quy = String(r[3] ?? "").trim();
    if (moTa.length < 12) continue;
    texts.push(quy ? `${moTa} ${quy}` : moTa);
  }
  return texts;
}

/** Bảng đơn giá chuẩn: 3 hàng tiêu đề + parseBaseItem. */
function extractBdgPrimaryTextsFromRows(rows: unknown[][], maxDataRows: number): string[] {
  const headerRows = rows.slice(0, 3);
  const dataRows = rows.slice(3);
  const headerMap = buildHeaderMap(headerRows);
  const texts: string[] = [];
  for (let i = 0; i < Math.min(dataRows.length, maxDataRows); i++) {
    const base = parseBaseItem(dataRows[i], headerMap);
    if (base.rowType !== "item") continue;
    const p = buildNormalizedPrimarySearchText(base).trim();
    if (p) texts.push(p);
  }
  return texts;
}

function extractTextsFromWorkbook(workbookPath: string, maxDataRows: number): string[] {
  const wb = XLSX.readFile(workbookPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];
  if (isBdgLayout(rows)) {
    return extractBdgPrimaryTextsFromRows(rows, maxDataRows);
  }
  return extractDuToanTextsFromSheet(sheet, maxDataRows);
}

function mineTexts(texts: string[]): NgramStats {
  const bi = new Map<string, number>();
  const tri = new Map<string, number>();
  for (const t of texts) {
    const norm = normalizeBaseSearchString(t);
    const tok = norm.split(/\s+/).filter((x) => x.length >= 2);
    for (const g of ngrams(tok, 2)) bi.set(g, (bi.get(g) ?? 0) + 1);
    for (const g of ngrams(tok, 3)) tri.set(g, (tri.get(g) ?? 0) + 1);
  }
  return {
    bigrams: topCounts(bi, 8, 60),
    trigrams: topCounts(tri, 6, 40),
  };
}

function main() {
  const argv = process.argv.slice(2);
  let outPath: string | null = null;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) {
      outPath = argv[++i];
    } else if (argv[i]?.endsWith(".xlsx")) {
      files.push(path.isAbsolute(argv[i]) ? argv[i] : path.join(repoRoot, argv[i]));
    }
  }
  const paths = files.length ? files : DEFAULT_FILES;

  const report: Record<
    string,
    { rowTextCount: number; bigrams: [string, number][]; trigrams: [string, number][] }
  > = {};

  for (const p of paths) {
    if (!fs.existsSync(p)) {
      console.error("Skip (missing):", p);
      continue;
    }
    const base = path.basename(p);
    let texts: string[] = [];
    try {
      texts = extractTextsFromWorkbook(p, 12000);
    } catch (e) {
      console.error("Failed:", p, e);
      continue;
    }
    const stats = mineTexts(texts);
    report[base] = { rowTextCount: texts.length, bigrams: stats.bigrams, trigrams: stats.trigrams };
    console.log("\n==", base, "texts", texts.length);
    console.log("bigrams (min 8, top 20):", stats.bigrams.slice(0, 20));
    console.log("trigrams (min 6, top 15):", stats.trigrams.slice(0, 15));
  }

  if (outPath) {
    const abs = path.isAbsolute(outPath) ? outPath : path.join(repoRoot, outPath);
    fs.writeFileSync(
      abs,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          sources: paths.filter((p) => fs.existsSync(p)),
          perFile: report,
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    console.log("\nWrote", abs);
  }
}

main();
