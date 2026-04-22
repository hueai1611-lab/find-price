export type RowType = "section" | "subgroup" | "item";

export type ParsedQuarterPrice = {
  pricePeriodCode: string;
  pricePeriodLabel: string;
  vatTu?: string | null;
  thiCong?: string | null;
  tongCong?: string | null;
  linkHdThamKhao?: string | null;
  ghiChu?: string | null;
};

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
  prices: ParsedQuarterPrice[];
};