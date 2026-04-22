export type SearchResult = {
  itemId: string;
  score: number;
  confidenceLabel: "Exact Match" | "Strong Match" | "Near Match" | "Related Match";

  stt?: string | null;
  ctxd?: string | null;
  maHieuHsmt?: string | null;
  maHieuKsg?: string | null;

  noiDungCongViec?: string | null;
  nhomCongTac?: string | null;
  quyCachKyThuat?: string | null;
  donVi?: string | null;

  pricePeriodCode?: string | null;
  pricePeriodLabel?: string | null;
  vatTu?: string | null;
  thiCong?: string | null;
  tongCong?: string | null;
  linkHdThamKhao?: string | null;
  ghiChu?: string | null;

  scoreBreakdown?: Record<string, number>;
};
