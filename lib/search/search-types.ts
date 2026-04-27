import type { BoqScoreDebugInfo } from "../ranking/calculate-score";

export type SearchResult = {
  itemId: string;
  importBatchId: string;
  sourceFileName: string;
  sheetName: string;
  sourceRowNumber: number | null;

  score: number;
  confidenceLabel: "Exact Match" | "Strong Match" | "Near Match" | "Related Match";

  stt?: string | null;
  ctxd?: string | null;
  maHieuHsmt?: string | null;
  maHieuKsg?: string | null;

  noiDungCongViec?: string | null;
  nhomCongTac?: string | null;
  quyCachKyThuat?: string | null;
  /** Ghép nội dung + quy cách + nhóm (theo thứ tự đó), bỏ phần trống. */
  noiDungTongHop: string;
  /** Blob tìm kiếm chính (nhóm + nội dung + quy, normalized). */
  normalizedPrimarySearchText?: string | null;
  /** Blob tìm kiếm tổng hợp (fallback / full row normalized). */
  normalizedSearchText?: string | null;
  donVi?: string | null;

  pricePeriodCode?: string | null;
  pricePeriodLabel?: string | null;
  vatTu?: string | null;
  thiCong?: string | null;
  tongCong?: string | null;
  linkHdThamKhao?: string | null;
  ghiChu?: string | null;

  scoreBreakdown?: Record<string, number>;
  /** Chỉ khi `DEBUG_BOQ_SCORING=1` — chi tiết debug ranking cho từng dòng kết quả. */
  scoreDebug?: BoqScoreDebugInfo;
};
