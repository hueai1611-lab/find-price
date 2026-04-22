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
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toPricePeriodCode(label: string): string {
  const normalized = label
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\./g, "_")
    .replace(/\+/g, "_")
    .replace(/quý/g, "q")
    .replace(/[^a-z0-9_]/g, "");

  return normalized || "unknown_period";
}

export function buildHeaderMap(headerRows: unknown[][]): HeaderMap {
  const [row1 = [], row2 = [], row3 = []] = headerRows;

  const maxCols = Math.max(row1.length, row2.length, row3.length);

  const baseColumns: Partial<Record<BaseColumnKey, number>> = {};
  const quarterGroupsMap = new Map<string, QuarterGroup>();

  for (let col = 0; col < maxCols; col++) {
    const h1 = normalizeHeaderCell(row1[col]);
    const h2 = normalizeHeaderCell(row2[col]);
    const h3 = normalizeHeaderCell(row3[col]);

    const mergedHeader = [h1, h2, h3].filter(Boolean).join(" | ");

    if (mergedHeader.includes("stt")) baseColumns.stt = col;
    else if (mergedHeader.includes("ctxd")) baseColumns.ctxd = col;
    else if (mergedHeader.includes("mã hiệu (hsmt)") || mergedHeader.includes("ma hieu (hsmt)")) baseColumns.maHieuHsmt = col;
    else if (mergedHeader.includes("mã hiệu (ksg)") || mergedHeader.includes("ma hieu (ksg)")) baseColumns.maHieuKsg = col;
    else if (mergedHeader.includes("nhóm công tác") || mergedHeader.includes("nhom cong tac")) baseColumns.nhomCongTac = col;
    else if (mergedHeader.includes("nội dung công việc") || mergedHeader.includes("noi dung cong viec")) baseColumns.noiDungCongViec = col;
    else if (mergedHeader.includes("quy cách kỹ thuật") || mergedHeader.includes("quy cach ky thuat")) baseColumns.quyCachKyThuat = col;
    else if (mergedHeader.includes("yêu cầu khác") || mergedHeader.includes("yeu cau khac")) baseColumns.yeuCauKhac = col;
    else if (mergedHeader.includes("đơn vị") || mergedHeader.includes("don vi")) baseColumns.donVi = col;
    else if (mergedHeader.includes("người thực hiện") || mergedHeader.includes("nguoi thuc hien")) baseColumns.nguoiThucHien = col;

    const possiblePeriod = [h1, h2].find(
      (v) => v.includes("quý") || v.includes("quy")
    );

    if (possiblePeriod) {
      const label = row1[col] ? String(row1[col]).trim() : String(row2[col] ?? "").trim();
      const code = toPricePeriodCode(label);

      if (!quarterGroupsMap.has(code)) {
        quarterGroupsMap.set(code, {
          pricePeriodCode: code,
          pricePeriodLabel: label,
          columns: {},
        });
      }

      const group = quarterGroupsMap.get(code)!;
      const subHeader = h2 || h3 || "";

      if (subHeader.includes("vật tư") || subHeader.includes("vat tu")) group.columns.vatTu = col;
      else if (subHeader.includes("thi công") || subHeader.includes("thi cong")) group.columns.thiCong = col;
      else if (subHeader.includes("tổng cộng") || subHeader.includes("tong cong")) group.columns.tongCong = col;
      else if (subHeader.includes("link") || subHeader.includes("hđ") || subHeader.includes("hd")) group.columns.linkHdThamKhao = col;
      else if (subHeader.includes("ghi chú") || subHeader.includes("ghi chu")) group.columns.ghiChu = col;
    }
  }

  return {
    baseColumns,
    quarterGroups: Array.from(quarterGroupsMap.values()),
  };
}