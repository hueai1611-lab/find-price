export type SearchResult = {
  itemId: string;
  score: number;
  confidenceLabel: "Exact Match" | "Strong Match" | "Near Match" | "Related Match";
  noiDungCongViec?: string | null;
  nhomCongTac?: string | null;
  quyCachKyThuat?: string | null;
  donVi?: string | null;
  pricePeriodCode?: string | null;
  pricePeriodLabel?: string | null;
  tongCong?: string | null;
  scoreBreakdown?: Record<string, number>;
};