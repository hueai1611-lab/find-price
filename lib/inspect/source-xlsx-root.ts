import path from "path";

/**
 * ## `SOURCE_XLSX_ROOT` — where `/inspect/row` reads workbooks from disk
 *
 * **Dev (local):** leave `SOURCE_XLSX_ROOT` unset → this returns `process.cwd()`
 * (repo root). Same convention as `scripts/import-demo.ts` placing `.xlsx` next to
 * `package.json`.
 *
 * **Prod / internal server:** set `SOURCE_XLSX_ROOT` to an **absolute** directory
 * that contains files named exactly like `ImportBatch.fileName` (e.g. synced uploads).
 * The inspect route never uses client-supplied paths, only `path.join(root, basename)`.
 */
export function getSourceXlsxRoot(): string {
  const raw = process.env.SOURCE_XLSX_ROOT?.trim();
  if (raw) {
    return path.resolve(raw);
  }
  return process.cwd();
}
