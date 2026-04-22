import type { HeaderMap } from "./header-map";

/** Một dòng giá theo một kỳ (từ `HeaderMap.quarterGroups`); chỉ chuỗi thô, không parse số. */
export type ParsedQuarterPrice = {
  pricePeriodCode: string;
  pricePeriodLabel: string;
  vatTu: string | null;
  thiCong: string | null;
  tongCong: string | null;
  linkHdThamKhao: string | null;
  ghiChu: string | null;
};

function cellText(row: unknown[], colIndex?: number): string | null {
  if (colIndex === undefined) return null;
  const v = String(row[colIndex] ?? "").trim();
  return v || null;
}

/**
 * Đọc từ một dòng dữ liệu Excel các ô giá theo từng kỳ đã map trong `headerMap.quarterGroups`.
 * Luôn trả về đúng một phần tử cho mỗi kỳ (kể cả khi mọi cột giá đều trống hoặc group chưa map đủ cột con).
 */
export function parseQuarterPrices(
  row: unknown[],
  headerMap: HeaderMap
): ParsedQuarterPrice[] {
  return headerMap.quarterGroups.map((group) => ({
    pricePeriodCode: group.pricePeriodCode,
    pricePeriodLabel: group.pricePeriodLabel,
    vatTu: cellText(row, group.columns.vatTu),
    thiCong: cellText(row, group.columns.thiCong),
    tongCong: cellText(row, group.columns.tongCong),
    linkHdThamKhao: cellText(row, group.columns.linkHdThamKhao),
    ghiChu: cellText(row, group.columns.ghiChu),
  }));
}

/**
 * Read price cells for exactly one quarter block (matches `headerMap` group code).
 * `selectedPricePeriodCode` must equal `group.pricePeriodCode` for some group
 * (same strings `buildHeaderMap` / `toPricePeriodCode` produce).
 */
export function parseSingleQuarterPriceForPeriod(
  row: unknown[],
  headerMap: HeaderMap,
  selectedPricePeriodCode: string
): ParsedQuarterPrice | null {
  const code = selectedPricePeriodCode.trim();
  const group = headerMap.quarterGroups.find((g) => g.pricePeriodCode === code);
  if (!group) return null;

  return {
    pricePeriodCode: code,
    pricePeriodLabel: group.pricePeriodLabel,
    vatTu: cellText(row, group.columns.vatTu),
    thiCong: cellText(row, group.columns.thiCong),
    tongCong: cellText(row, group.columns.tongCong),
    linkHdThamKhao: cellText(row, group.columns.linkHdThamKhao),
    ghiChu: cellText(row, group.columns.ghiChu),
  };
}