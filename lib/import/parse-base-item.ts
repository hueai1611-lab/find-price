import type { HeaderMap } from "./header-map";
import { classifyRow, extractHierarchyCodes, type RowType } from "./row-classifier";

export type ParsedBaseItem = {
  stt?: string | null;
  ctxd?: string | null;
  maHieuHsmt?: string | null;
  maHieuKsg?: string | null;
  nhomCongTac?: string | null;
  noiDungCongViec?: string | null;
  quyCachKyThuat?: string | null;
  yeuCauKhac?: string | null;
  donVi?: string | null;
  nguoiThucHien?: string | null;
  rowType: RowType;
  sectionCode?: string | null;
  subgroupCode?: string | null;
  rawRowJson?: unknown;
};

function value(row: unknown[], index?: number): string | null {
  if (index === undefined) return null;
  const v = String(row[index] ?? "").trim();
  return v || null;
}

export function parseBaseItem(row: unknown[], headerMap: HeaderMap): ParsedBaseItem {
  const rowType = classifyRow(
    row,
    headerMap.baseColumns.stt,
    headerMap.baseColumns.noiDungCongViec
  );

  const hierarchy = extractHierarchyCodes(row, headerMap.baseColumns.stt);

  return {
    stt: value(row, headerMap.baseColumns.stt),
    ctxd: value(row, headerMap.baseColumns.ctxd),
    maHieuHsmt: value(row, headerMap.baseColumns.maHieuHsmt),
    maHieuKsg: value(row, headerMap.baseColumns.maHieuKsg),
    nhomCongTac: value(row, headerMap.baseColumns.nhomCongTac),
    noiDungCongViec: value(row, headerMap.baseColumns.noiDungCongViec),
    quyCachKyThuat: value(row, headerMap.baseColumns.quyCachKyThuat),
    yeuCauKhac: value(row, headerMap.baseColumns.yeuCauKhac),
    donVi: value(row, headerMap.baseColumns.donVi),
    nguoiThucHien: value(row, headerMap.baseColumns.nguoiThucHien),
    rowType,
    sectionCode: hierarchy.sectionCode ?? null,
    subgroupCode: hierarchy.subgroupCode ?? null,
    rawRowJson: row,
  };
}