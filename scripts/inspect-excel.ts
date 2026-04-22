import * as XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const filePath = path.join(
  repoRoot,
  "VH_XD31_VBLQ_Bo don gia (XD)_01.04.2026 (1).xlsx"
);

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

const rows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  raw: false,
}) as unknown[][];

console.log("Sheet:", sheetName);
console.log("Total rows:", rows.length);
console.log("Row 1:", rows[0]);
console.log("Row 2:", rows[1]);
console.log("Row 3:", rows[2]);
console.log("Row 10:", rows[9]);