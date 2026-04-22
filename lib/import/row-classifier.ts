export type RowType = "section" | "subgroup" | "item" | "empty";

function cell(row: unknown[], index?: number): string {
  if (index === undefined) return "";
  return String(row[index] ?? "").trim();
}

function isSectionStt(stt: string): boolean {
  return /^TC\.\d+$/i.test(stt);
}

function isSubgroupStt(stt: string): boolean {
  return /^\d+\.\d+$/.test(stt);
}

function isItemStt(stt: string): boolean {
  return /^\d+$/.test(stt);
}

export function classifyRow(
  row: unknown[],
  sttIndex?: number,
  noiDungIndex?: number
): RowType {
  const stt = cell(row, sttIndex);
  const noiDung = cell(row, noiDungIndex);

  if (!stt && !noiDung) return "empty";

  if (isSectionStt(stt)) return "section";
  if (isSubgroupStt(stt)) return "subgroup";

  // Phase 1 assumption:
  // a row with work content is treated as an item,
  // and a plain numeric STT is also treated as an item.
  if (noiDung || isItemStt(stt)) return "item";

  return "empty";
}

export function extractHierarchyCodes(
  row: unknown[],
  sttIndex?: number
): {
  sectionCode?: string;
  subgroupCode?: string;
} {
  const stt = cell(row, sttIndex);

  if (isSectionStt(stt)) {
    return { sectionCode: stt };
  }

  if (isSubgroupStt(stt)) {
    return { subgroupCode: stt };
  }

  return {};
}