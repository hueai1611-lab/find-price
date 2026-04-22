export type RowType = "section" | "subgroup" | "item" | "empty";

function cell(row: unknown[], index?: number): string {
  if (index === undefined) return "";
  return String(row[index] ?? "").trim();
}

export function classifyRow(
  row: unknown[],
  sttIndex?: number,
  noiDungIndex?: number
): RowType {
  const stt = cell(row, sttIndex);
  const noiDung = cell(row, noiDungIndex);

  if (!stt && !noiDung) return "empty";

  if (/^TC\.\d+/i.test(stt)) return "section";
  if (/^\d+\.\d+/.test(stt)) return "subgroup";

  if (noiDung || /^\d+$/.test(stt)) return "item";

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

  if (/^TC\.\d+/i.test(stt)) {
    return { sectionCode: stt };
  }

  if (/^\d+\.\d+/.test(stt)) {
    return { subgroupCode: stt };
  }

  return {};
}