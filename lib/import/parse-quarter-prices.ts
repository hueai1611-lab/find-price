import type { HeaderMap } from "./header-map";

export type ParsedQuarterPrice = {
  pricePeriodCode: string;
  pricePeriodLabel: string;
  vatTu?: string | null;
  thiCong?: string | null;
  tongCong?: string | null;
  linkHdThamKhao?: string | null;
  ghiChu?: string | null;
};

function value(row: unknown[], index?: number): string | null {
  if (index === undefined) return null;
  const v = String(row[index] ?? "").trim();
  return v || null;
}

export function parseQuarterPrices(
  row: unknown[],
  headerMap: HeaderMap
): ParsedQuarterPrice[] {
  return headerMap.quarterGroups.map((group) => ({
    pricePeriodCode: group.pricePeriodCode,
    pricePeriodLabel: group.pricePeriodLabel,
    vatTu: value(row, group.columns.vatTu),
    thiCong: value(row, group.columns.thiCong),
    tongCong: value(row, group.columns.tongCong),
    linkHdThamKhao: value(row, group.columns.linkHdThamKhao),
    ghiChu: value(row, group.columns.ghiChu),
  }));
}