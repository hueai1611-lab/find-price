/** Which Excel desktop environment will open the generated workbook (drives path separator style in external links). */
export const LINK_EXCEL_TARGETS = ["windows", "mac"] as const;
export type LinkExcelTarget = (typeof LINK_EXCEL_TARGETS)[number];

export function parseLinkExcelTarget(raw: unknown): LinkExcelTarget {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "mac") return "mac";
  return "windows";
}

type ExternalLinkFormulaInput = {
  /** Root folder path, e.g. \\server\share\path\ (UNC) or local folder path in dev. */
  rootPath: string;
  /**
   * Path style for the external workbook segment inside the formula.
   * - `windows`: backslashes, trailing `\` (UNC `\\server\share\...`).
   * - `mac`: forward slashes, trailing `/` (UNC `//server/share/...` or `/Volumes/.../`).
   */
  linkTarget?: LinkExcelTarget;
  /** Workbook file name, e.g. "VH_..._01.04.2026.xlsx" */
  workbookFileName: string;
  /** Sheet name inside workbook. */
  sheetName: string;
  /** 1-based Excel row number. */
  rowNumber: number;
  /** 1-based Excel column number. */
  colNumber: number;
};

/**
 * Normalize the configured quarter-master root for how Excel encodes external paths on each OS.
 * Does not invent mount points: admins should store a root that already resolves on users' machines
 * (e.g. production UNC for Windows, or `/Volumes/ShareName/...` for Mac when the share is mounted).
 */
export function formatRootPathForLinkTarget(rootPath: string, linkTarget: LinkExcelTarget): string {
  const trimmed = rootPath.trim();
  if (!trimmed) return "";
  if (linkTarget === "windows") {
    const withBackslashes = trimmed.replace(/\//g, "\\");
    return withBackslashes.endsWith("\\") ? withBackslashes : `${withBackslashes}\\`;
  }
  const withSlashes = trimmed.replace(/\\/g, "/");
  return withSlashes.endsWith("/") ? withSlashes : `${withSlashes}/`;
}

function escapeExcelSingleQuotes(s: string): string {
  return s.replace(/'/g, "''");
}

function toExcelColumnLetters(colNumber: number): string {
  if (!Number.isFinite(colNumber) || colNumber < 1) {
    throw new Error(`Invalid Excel colNumber: ${colNumber}`);
  }
  let n = Math.floor(colNumber);
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Build an external workbook linked formula referencing a single cell.
 *
 * Examples:
 * - Windows: `='\\server\share\[Book.xlsx]Sheet 1'!$M$57`
 * - Mac: `='//server/share/[Book.xlsx]Sheet 1'!$M$57` or `='/Volumes/Share/[Book.xlsx]Sheet1'!$M$57`
 */
export function buildExternalCellLinkFormula(input: ExternalLinkFormulaInput): string {
  const linkTarget = input.linkTarget ?? "windows";
  const root = formatRootPathForLinkTarget(input.rootPath, linkTarget);
  const file = String(input.workbookFileName ?? "").trim();
  const sheet = String(input.sheetName ?? "").trim();
  const row = input.rowNumber;
  const col = input.colNumber;

  if (!root) throw new Error("rootPath is required");
  if (!file) throw new Error("workbookFileName is required");
  if (!sheet) throw new Error("sheetName is required");
  if (!Number.isFinite(row) || row < 1) throw new Error(`Invalid rowNumber: ${row}`);

  const colLetters = toExcelColumnLetters(col);
  const absRef = `$${colLetters}$${Math.floor(row)}`;

  const sheetEscaped = escapeExcelSingleQuotes(sheet);
  const ref = `${root}[${file}]${sheetEscaped}`;
  return `='${ref}'!${absRef}`;
}

