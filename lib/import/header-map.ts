export type BaseColumnKey =
  | "stt"
  | "ctxd"
  | "maHieuHsmt"
  | "maHieuKsg"
  | "nhomCongTac"
  | "noiDungCongViec"
  | "quyCachKyThuat"
  | "yeuCauKhac"
  | "donVi"
  | "nguoiThucHien";

export type QuarterSubKey =
  | "vatTu"
  | "thiCong"
  | "tongCong"
  | "linkHdThamKhao"
  | "ghiChu";

export type QuarterGroup = {
  pricePeriodCode: string;
  pricePeriodLabel: string;
  columns: Partial<Record<QuarterSubKey, number>>;
};

export type HeaderMap = {
  baseColumns: Partial<Record<BaseColumnKey, number>>;
  quarterGroups: QuarterGroup[];
};

function normalizeHeaderCell(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function collapsedHeader(v: string): string {
  return v.replace(/\s+/g, "");
}

/**
 * Vinhomes-style BOQ headers: "Quý" + Roman block + ".yy" (optional 4-digit year).
 * Collapsed match avoids "quy cách" (no Roman + year after quy).
 * Alternation order: longer Roman segments first (ii+iii before iii before ii before i).
 */
const QUARTER_TOKEN_REGEX = /(quý|quy)(ii\+iii|iii|iv|ii|i)(\.\d{2,4})/;

const ROMAN_DISPLAY: Record<string, string> = {
  "ii+iii": "II+III",
  iii: "III",
  iv: "IV",
  ii: "II",
  i: "I",
};

/** Returns a short display label like "Quý III.26", never the whole wrapped header sentence. */
function extractQuarterLabelFromNormalizedLine(line: string): string | null {
  if (!line.trim()) return null;
  const collapsed = collapsedHeader(line);
  const m = collapsed.match(QUARTER_TOKEN_REGEX);
  if (!m) return null;
  const romanKey = m[2];
  const roman = ROMAN_DISPLAY[romanKey];
  if (!roman) return null;
  const yearPart = m[3];
  return `Quý ${roman}${yearPart}`;
}

function extractKnownQuarterLabel(h1: string, h2: string, h3: string): string | null {
  for (const line of [h1, h2, h3]) {
    if (!line) continue;
    const hit = extractQuarterLabelFromNormalizedLine(line);
    if (hit) return hit;
  }
  return extractQuarterLabelFromNormalizedLine([h1, h2, h3].filter(Boolean).join(" "));
}

/**
 * `pricePeriodCode` chỉ từ `pricePeriodLabel` sạch (sau extract). Ví dụ:
 * - Quý III.26 → Q3_2026
 * - Quý IV.26 → Q4_2026
 * - Quý I.27 → Q1_2027
 * - Quý II+III.26 → Q2_Q3_2026
 */
function toPricePeriodCode(cleanQuarterLabel: string): string {
  const trimmed = cleanQuarterLabel.trim();
  const m = trimmed.match(/^Quý\s+(II\+III|III|IV|II|I)\.(\d{2}|\d{4})$/i);
  if (m) {
    const roman = m[1];
    const yr = m[2];
    const fullYear = yr.length === 2 ? `20${yr}` : yr;
    const prefix: Record<string, string> = {
      I: "Q1",
      II: "Q2",
      III: "Q3",
      IV: "Q4",
      "II+III": "Q2_Q3",
    };
    const p = prefix[roman];
    if (p) return `${p}_${fullYear}`;
  }
  const normalized = trimmed
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\./g, "_")
    .replace(/\+/g, "_")
    .replace(/quý/g, "q")
    .replace(/[^a-z0-9_]/g, "");

  return normalized || "unknown_period";
}

/**
 * Vinhomes BOQ: mỗi block kỳ neo tại `anchorCol`, 5 cột giá cố định (header 2 cột số thường trống).
 * First-match-wins: không ghi đè index đã gán (anchor trùng merge / cùng code).
 */
function assignQuarterColumnsByAnchor(
  group: QuarterGroup,
  anchorCol: number,
  maxCols: number
): void {
  const slots: [QuarterSubKey, number][] = [
    ["vatTu", anchorCol],
    ["thiCong", anchorCol + 1],
    ["tongCong", anchorCol + 2],
    ["linkHdThamKhao", anchorCol + 3],
    ["ghiChu", anchorCol + 4],
  ];
  for (const [key, c] of slots) {
    if (c < 0 || c >= maxCols) continue;
    if (group.columns[key] !== undefined) continue;
    group.columns[key] = c;
  }
}

export function buildHeaderMap(headerRows: unknown[][]): HeaderMap {
  const [row1 = [], row2 = [], row3 = []] = headerRows;

  const maxCols = Math.max(row1.length, row2.length, row3.length);

  const baseColumns: Partial<Record<BaseColumnKey, number>> = {};
  const quarterGroupsByCode = new Map<string, QuarterGroup>();
  /** Insertion order = first anchor left-to-right for each distinct `pricePeriodCode`. */
  const quarterGroupOrder: string[] = [];
  let activeQuarterCode: string | null = null;

  const ensureQuarterGroup = (cleanLabel: string): string => {
    const code = toPricePeriodCode(cleanLabel);
    if (!quarterGroupsByCode.has(code)) {
      quarterGroupsByCode.set(code, {
        pricePeriodCode: code,
        pricePeriodLabel: cleanLabel,
        columns: {},
      });
      quarterGroupOrder.push(code);
    }
    return code;
  };

  for (let col = 0; col < maxCols; col++) {
    const h1 = normalizeHeaderCell(row1[col]);
    const h2 = normalizeHeaderCell(row2[col]);
    const h3 = normalizeHeaderCell(row3[col]);

    const mergedHeader = [h1, h2, h3].filter(Boolean).join(" | ");

    // First matching column wins — avoids later spacer/duplicate text overwriting a good index.
    if (mergedHeader.includes("stt") && baseColumns.stt === undefined) baseColumns.stt = col;
    else if (mergedHeader.includes("ctxd") && baseColumns.ctxd === undefined) baseColumns.ctxd = col;
    else if (
      (mergedHeader.includes("mã hiệu (hsmt)") || mergedHeader.includes("ma hieu (hsmt)")) &&
      baseColumns.maHieuHsmt === undefined
    )
      baseColumns.maHieuHsmt = col;
    else if (
      (mergedHeader.includes("mã hiệu (ksg)") || mergedHeader.includes("ma hieu (ksg)")) &&
      baseColumns.maHieuKsg === undefined
    )
      baseColumns.maHieuKsg = col;
    else if (
      (mergedHeader.includes("nhóm công tác") || mergedHeader.includes("nhom cong tac")) &&
      baseColumns.nhomCongTac === undefined
    )
      baseColumns.nhomCongTac = col;
    else if (
      (mergedHeader.includes("nội dung công việc") || mergedHeader.includes("noi dung cong viec")) &&
      baseColumns.noiDungCongViec === undefined
    )
      baseColumns.noiDungCongViec = col;
    else if (
      (mergedHeader.includes("quy cách kỹ thuật") || mergedHeader.includes("quy cach ky thuat")) &&
      baseColumns.quyCachKyThuat === undefined
    )
      baseColumns.quyCachKyThuat = col;
    else if (
      (mergedHeader.includes("yêu cầu khác") || mergedHeader.includes("yeu cau khac")) &&
      baseColumns.yeuCauKhac === undefined
    )
      baseColumns.yeuCauKhac = col;
    else if ((mergedHeader.includes("đơn vị") || mergedHeader.includes("don vi")) && baseColumns.donVi === undefined)
      baseColumns.donVi = col;
    else if (
      (mergedHeader.includes("người thực hiện") || mergedHeader.includes("nguoi thuc hien")) &&
      baseColumns.nguoiThucHien === undefined
    )
      baseColumns.nguoiThucHien = col;

    // End of price region on this sheet (column after last quarter blocks).
    if (mergedHeader.includes("người thực hiện") || mergedHeader.includes("nguoi thuc hien")) {
      activeQuarterCode = null;
    }

    const cleanQuarterLabel = extractKnownQuarterLabel(h1, h2, h3);
    if (cleanQuarterLabel) {
      activeQuarterCode = ensureQuarterGroup(cleanQuarterLabel);
      const group = quarterGroupsByCode.get(activeQuarterCode)!;
      assignQuarterColumnsByAnchor(group, col, maxCols);
      continue;
    }
  }

  const quarterGroups = quarterGroupOrder.map((code) => quarterGroupsByCode.get(code)!);

  return {
    baseColumns,
    quarterGroups,
  };
}
